"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InvitationActionState = {
  invitationUrl?: string;
  message?: string;
  success?: boolean;
};

const inviteSchema = z.object({
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  organizationId: z.uuid(),
  role: z.enum(["owner", "admin", "viewer"]),
});

export async function createInvitationAction(_state: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  await requireVerifiedIdentity();
  const parsed = inviteSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    organizationId: String(formData.get("organization_id") ?? ""),
    role: String(formData.get("role") ?? "viewer"),
  });
  if (!parsed.success) return { message: "Revisa el correo y el rol de la invitación." };
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_organization_invitation", {
    requested_email: parsed.data.email,
    requested_expires_at: expiresAt,
    requested_organization_id: parsed.data.organizationId,
    requested_role: parsed.data.role,
    requested_token_hash: tokenHash,
  });
  if (error) return { message: error.code === "23505" ? "Esa persona ya forma parte del proyecto." : error.code === "42501" ? "Solo un owner puede invitar o cambiar roles." : "No se ha podido crear la invitación." };
  const origin = (() => { try { return new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.attruvi.com").origin; } catch { return "https://www.attruvi.com"; } })();
  revalidatePath("/dashboard/settings");
  return { invitationUrl: `${origin}/invite/${token}`, message: "Invitación creada. Comparte este enlace privado; caduca en 7 días.", success: true };
}

const roleSchema = z.object({ organizationId: z.uuid(), role: z.enum(["owner", "admin", "viewer"]), userId: z.uuid() });

const privacySchema = z.object({
  appId: z.uuid(),
  audit: z.coerce.number().int().min(30).max(3650),
  clicks: z.coerce.number().int().min(1).max(3650),
  debug: z.coerce.number().int().min(1).max(90),
  events: z.coerce.number().int().min(1).max(3650),
  legalBasis: z.string().max(500),
  postbacks: z.coerce.number().int().min(1).max(730),
  probabilistic: z.boolean(),
});

export async function updatePrivacySettingsAction(formData: FormData) {
  await requireVerifiedIdentity();
  const parsed = privacySchema.safeParse({
    appId: String(formData.get("app_id") ?? ""),
    audit: formData.get("audit_days"),
    clicks: formData.get("click_days"),
    debug: formData.get("debug_days"),
    events: formData.get("event_days"),
    legalBasis: String(formData.get("legal_basis_note") ?? ""),
    postbacks: formData.get("postback_days"),
    probabilistic: formData.get("probabilistic") === "on",
  });
  if (!parsed.success) redirect("/dashboard/settings?error=privacy-invalid");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_app_privacy_settings", {
    requested_app_id: parsed.data.appId,
    requested_audit_retention_days: parsed.data.audit,
    requested_debug_retention_days: parsed.data.debug,
    requested_event_properties_retention_days: parsed.data.events,
    requested_legal_basis_note: parsed.data.legalBasis || null,
    requested_postback_detail_retention_days: parsed.data.postbacks,
    requested_raw_click_retention_days: parsed.data.clicks,
    requested_allow_probabilistic_attribution: parsed.data.probabilistic,
  });
  if (error) redirect("/dashboard/settings?error=permission");
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=privacy");
}

export async function changeMemberRoleAction(formData: FormData) {
  await requireVerifiedIdentity();
  const parsed = roleSchema.safeParse({ organizationId: String(formData.get("organization_id") ?? ""), role: String(formData.get("role") ?? "viewer"), userId: String(formData.get("user_id") ?? "") });
  if (!parsed.success) redirect("/dashboard/settings?error=invalid-role");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("change_organization_member_role", {
    requested_organization_id: parsed.data.organizationId,
    requested_role: parsed.data.role,
    requested_user_id: parsed.data.userId,
  });
  if (error) redirect(`/dashboard/settings?error=${error.message === "last_owner" ? "last-owner" : "permission"}`);
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=role");
}
