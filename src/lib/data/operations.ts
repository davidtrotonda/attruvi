import "server-only";

import type { VerifiedIdentity } from "@/lib/auth/session";
import { getDashboardContext, type DashboardSelection, type OrganizationRole } from "@/lib/data/dashboard-context";

const PAGE_SIZE = 25;

export async function getEventsDashboard(
  identity: VerifiedIdentity,
  filters: DashboardSelection & { event?: string; from: string; page: number; to: string },
) {
  const context = await getDashboardContext(identity, filters);
  const app = context.selectedApp;
  if (!app) return { ...context, eventNames: [], events: [], page: 1, pageCount: 0, total: 0 };
  const from = `${filters.from}T00:00:00.000Z`;
  const to = `${filters.to}T23:59:59.999Z`;
  let query = context.client
    .from("events")
    .select("id,name,occurred_at,received_at,value_minor,currency,installation_id,attribution_source_name,attribution_campaign_name", { count: "exact" })
    .eq("app_id", app.id)
    .gte("occurred_at", from)
    .lte("occurred_at", to);
  if (filters.event) query = query.eq("name", filters.event);
  const start = (filters.page - 1) * PAGE_SIZE;
  const [{ data: events, count, error }, { data: names, error: namesError }] = await Promise.all([
    query.order("occurred_at", { ascending: false }).range(start, start + PAGE_SIZE - 1),
    context.client.from("events").select("name").eq("app_id", app.id).limit(10_000),
  ]);
  if (error || namesError) throw new Error("No se han podido cargar los eventos.");
  const total = count ?? 0;
  return {
    ...context,
    eventNames: [...new Set((names ?? []).map((row) => row.name))].sort(),
    events: events ?? [],
    page: filters.page,
    pageCount: Math.ceil(total / PAGE_SIZE),
    total,
  };
}

export async function getPostbacksDashboard(
  identity: VerifiedIdentity,
  filters: DashboardSelection & { page: number; status?: string },
) {
  const context = await getDashboardContext(identity, filters);
  const app = context.selectedApp;
  if (!app) return { ...context, destinations: [], jobs: [], page: 1, pageCount: 0, stats: {}, total: 0 };
  let query = context.client
    .from("postback_jobs")
    .select("id,destination_id,status,attempt_count,last_error_code,created_at,completed_at,next_attempt_at", { count: "exact" })
    .eq("app_id", app.id);
  if (filters.status) query = query.eq("status", filters.status);
  const start = (filters.page - 1) * PAGE_SIZE;
  const [jobsResult, destinationsResult, statsResult] = await Promise.all([
    query.order("created_at", { ascending: false }).range(start, start + PAGE_SIZE - 1),
    context.client.from("postback_destinations").select("id,provider,name,event_name,status,send_value").eq("app_id", app.id),
    context.client.from("postback_jobs").select("status").eq("app_id", app.id).limit(10_000),
  ]);
  if (jobsResult.error || destinationsResult.error || statsResult.error) throw new Error("No se han podido cargar los postbacks.");
  const destinations = destinationsResult.data ?? [];
  const destinationById = new Map(destinations.map((destination) => [destination.id, destination]));
  const stats = (statsResult.data ?? []).reduce<Record<string, number>>((result, row) => {
    result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, {});
  const total = jobsResult.count ?? 0;
  return {
    ...context,
    destinations,
    jobs: (jobsResult.data ?? []).map((job) => ({ ...job, destination: destinationById.get(job.destination_id) ?? null })),
    page: filters.page,
    pageCount: Math.ceil(total / PAGE_SIZE),
    stats,
    total,
  };
}

type TeamMember = {
  display_name: string;
  email: string;
  joined_at: string;
  member_id: string;
  role: OrganizationRole;
  user_id: string;
};

export async function getSettingsDashboard(identity: VerifiedIdentity, selection: DashboardSelection) {
  const context = await getDashboardContext(identity, selection);
  const organization = context.organization;
  const app = context.selectedApp;
  if (!organization) return { ...context, invitations: [], members: [], platforms: [], sdkKeys: [] };
  const [teamResult, invitationsResult, platformsResult, keysResult] = await Promise.all([
    context.client.rpc("read_organization_team", { requested_organization_id: organization.id }),
    context.role === "owner"
      ? context.client.from("organization_invitations").select("id,email,role,status,expires_at,created_at").eq("organization_id", organization.id).eq("status", "pending").order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    app
      ? context.client.from("app_platforms").select("platform,ios_bundle_id,android_package_name,store_url").eq("app_id", app.id)
      : Promise.resolve({ data: [], error: null }),
    app
      ? context.client.from("public_sdk_keys").select("id,visible_prefix,environment,status,last_used_at,created_at").eq("app_id", app.id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (teamResult.error || invitationsResult.error || platformsResult.error || keysResult.error) throw new Error("No se han podido cargar los ajustes.");
  return {
    ...context,
    invitations: invitationsResult.data ?? [],
    members: (teamResult.data ?? []) as TeamMember[],
    platforms: platformsResult.data ?? [],
    sdkKeys: keysResult.data ?? [],
  };
}
