import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type VerifiedIdentity = {
  displayName: string;
  email: string | null;
  id: string;
};

export async function getVerifiedIdentity(
  suppliedClient?: SupabaseClient,
): Promise<VerifiedIdentity | null> {
  const supabase = suppliedClient ?? (await createSupabaseServerClient());
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims || typeof claims.sub !== "string") return null;

  const metadata =
    claims.user_metadata && typeof claims.user_metadata === "object"
      ? (claims.user_metadata as Record<string, unknown>)
      : {};
  const rawName = metadata.full_name ?? metadata.name;
  const email = typeof claims.email === "string" ? claims.email : null;

  return {
    displayName:
      typeof rawName === "string" && rawName.trim()
        ? rawName.trim().slice(0, 120)
        : email?.split("@")[0] || "Usuario",
    email,
    id: claims.sub,
  };
}

export async function requireVerifiedIdentity() {
  const identity = await getVerifiedIdentity();
  if (!identity) redirect("/?auth=required&next=/dashboard");
  return identity;
}

export async function ensurePersonalWorkspace(
  supabase: SupabaseClient,
  displayName: string,
) {
  const { data, error } = await supabase.rpc("ensure_personal_workspace", {
    requested_display_name: displayName,
  });

  if (error) throw new Error("No se ha podido preparar tu espacio de trabajo.");

  const workspace = Array.isArray(data) ? data[0] : data;
  if (!workspace || typeof workspace.organization_id !== "string") {
    throw new Error("No se ha podido recuperar tu espacio de trabajo.");
  }

  return {
    onboardingComplete: workspace.onboarding_complete === true,
    organizationId: workspace.organization_id as string,
  };
}
