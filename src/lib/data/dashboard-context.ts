import "server-only";

import { cache } from "react";
import { ensurePersonalWorkspace, type VerifiedIdentity } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrganizationRole = "admin" | "owner" | "viewer";

export type DashboardAppOption = {
  currency: string;
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrganizationRole;
  slug: string;
  status: "active" | "disabled" | "paused";
  timezone: string;
};

export type DashboardSelection = {
  app?: string;
  workspace?: string;
};

const loadNavigation = cache(async (userId: string, displayName: string) => {
  const client = await createSupabaseServerClient();
  const personal = await ensurePersonalWorkspace(client, displayName);
  const { data: membershipRows, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", userId);

  if (membershipError) throw new Error("No se han podido cargar tus proyectos.");
  const memberships = (membershipRows ?? []) as Array<{
    organization_id: string;
    role: OrganizationRole;
  }>;
  const organizationIds = memberships.map((membership) => membership.organization_id);
  if (!organizationIds.includes(personal.organizationId)) organizationIds.unshift(personal.organizationId);

  const [{ data: organizations, error: organizationError }, { data: apps, error: appsError }] =
    await Promise.all([
      client
        .from("organizations")
        .select("id,name,slug")
        .in("id", organizationIds),
      client
        .from("apps")
        .select("id,organization_id,name,slug,status,currency,timezone,created_at")
        .in("organization_id", organizationIds)
        .order("created_at", { ascending: true }),
    ]);

  if (organizationError || appsError) throw new Error("No se han podido cargar tus aplicaciones.");
  const organizationById = new Map(
    (organizations ?? []).map((organization) => [organization.id, organization]),
  );
  const roleByOrganization = new Map(
    memberships.map((membership) => [membership.organization_id, membership.role]),
  );

  const options = (apps ?? []).flatMap((app): DashboardAppOption[] => {
    const organization = organizationById.get(app.organization_id);
    if (!organization) return [];
    return [{
      currency: app.currency,
      id: app.id,
      name: app.name,
      organizationId: app.organization_id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      role: roleByOrganization.get(app.organization_id) ?? "viewer",
      slug: app.slug,
      status: app.status,
      timezone: app.timezone,
    }];
  });

  return {
    apps: options,
    client,
    organizations: organizations ?? [],
    personalOrganizationId: personal.organizationId,
  };
});

export async function getDashboardNavigation(identity: VerifiedIdentity) {
  return loadNavigation(identity.id, identity.displayName);
}

export async function getDashboardContext(
  identity: VerifiedIdentity,
  selection: DashboardSelection = {},
) {
  const navigation = await getDashboardNavigation(identity);
  const requestedWorkspace = selection.workspace?.trim();
  const requestedApp = selection.app?.trim();
  const selectedApp =
    navigation.apps.find((app) =>
      (app.id === requestedApp || app.slug === requestedApp) &&
      (!requestedWorkspace || app.organizationSlug === requestedWorkspace),
    ) ??
    navigation.apps.find((app) =>
      app.organizationId === navigation.personalOrganizationId && app.status === "active",
    ) ??
    navigation.apps.find((app) => app.organizationId === navigation.personalOrganizationId) ??
    navigation.apps.find((app) => app.status === "active") ??
    navigation.apps[0] ??
    null;
  const selectedOrganization = selectedApp
    ? navigation.organizations.find((organization) => organization.id === selectedApp.organizationId) ?? null
    : navigation.organizations.find((organization) => organization.id === navigation.personalOrganizationId) ??
      navigation.organizations[0] ?? null;

  return {
    ...navigation,
    organization: selectedOrganization,
    role: selectedApp?.role ?? "owner",
    selectedApp,
  };
}

export function selectionParams(app: DashboardAppOption | null, environment = "production") {
  return app
    ? { app: app.slug, environment, workspace: app.organizationSlug }
    : { environment };
}
