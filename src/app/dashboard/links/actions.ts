"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { purgeSmartLinkCache } from "@/lib/smart-links/cache";
import { smartLinkFormSchema } from "@/lib/smart-links/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SmartLinkActionState = {
  errors?: Record<string, string[]>;
  message?: string;
  success?: boolean;
};

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

export async function saveSmartLinkAction(
  _previousState: SmartLinkActionState,
  formData: FormData,
): Promise<SmartLinkActionState> {
  await requireVerifiedIdentity();
  const parsed = smartLinkFormSchema.safeParse({
    adExternalId: text(formData, "ad_external_id"),
    adGroupExternalId: text(formData, "ad_group_external_id"),
    adGroupName: text(formData, "ad_group_name"),
    adName: text(formData, "ad_name"),
    affiliateId: text(formData, "affiliate_id"),
    androidUrl: text(formData, "android_url"),
    appId: text(formData, "app_id"),
    attributionWindowDays: text(formData, "attribution_window_days"),
    campaignExternalId: text(formData, "campaign_external_id"),
    campaignName: text(formData, "campaign_name"),
    creatorId: text(formData, "creator_id"),
    deepLinkPath: text(formData, "deep_link_path"),
    destinationMode: text(formData, "destination_mode"),
    iosUrl: text(formData, "ios_url"),
    name: text(formData, "name"),
    slug: text(formData, "slug"),
    smartLinkId: text(formData, "smart_link_id"),
    sourceKind: text(formData, "source_kind"),
    status: text(formData, "status"),
    utmCampaign: text(formData, "utm_campaign"),
    utmContent: text(formData, "utm_content"),
    utmMedium: text(formData, "utm_medium"),
    utmSource: text(formData, "utm_source"),
    utmTerm: text(formData, "utm_term"),
    webUrl: text(formData, "web_url"),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: "Revisa los campos marcados." };
  }

  const data = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase.rpc("upsert_personal_smart_link", {
    payload: {
      ad_external_id: data.adExternalId || null,
      ad_group_external_id: data.adGroupExternalId || null,
      ad_group_name: data.adGroupName || null,
      ad_name: data.adName || null,
      affiliate_id: data.affiliateId || null,
      android_url: data.androidUrl || null,
      app_id: data.appId,
      attribution_window_days: data.attributionWindowDays,
      campaign_external_id: data.campaignExternalId || null,
      campaign_name: data.campaignName || null,
      creator_id: data.creatorId || null,
      deep_link_path: data.deepLinkPath || null,
      destination_mode: data.destinationMode,
      ios_url: data.iosUrl || null,
      name: data.name,
      slug: data.slug,
      smart_link_id: data.smartLinkId || null,
      source_kind: data.sourceKind,
      status: data.status,
      utm_campaign: data.utmCampaign || null,
      utm_content: data.utmContent || null,
      utm_medium: data.utmMedium || null,
      utm_source: data.utmSource || null,
      utm_term: data.utmTerm || null,
      web_url: data.webUrl,
    },
  });

  if (error) {
    return {
      message: error.code === "23505"
        ? "Ese slug ya existe. Prueba con otro nombre corto."
        : "No se ha podido guardar el enlace. Inténtalo de nuevo.",
    };
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  const purge = await purgeSmartLinkCache([row?.previous_slug, data.slug]);
  revalidatePath("/dashboard/apps");
  revalidatePath("/dashboard/links");
  const saved = data.smartLinkId ? "updated" : "created";
  const cacheWarning = purge.configured && !purge.ok ? "&cache=pending" : "";
  redirect(`/dashboard/links?app=${data.appId}&saved=${saved}${cacheWarning}`);
}

const statusInputSchema = z.object({
  id: z.uuid(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/),
  status: z.enum(["active", "disabled"]),
});

export async function setSmartLinkStatusAction(id: string, slug: string, status: string) {
  await requireVerifiedIdentity();
  const parsed = statusInputSchema.safeParse({ id, slug, status });
  if (!parsed.success) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_personal_smart_link_status", {
    requested_smart_link_id: parsed.data.id,
    requested_status: parsed.data.status,
  });
  if (error) return;
  await purgeSmartLinkCache([parsed.data.slug]);
  revalidatePath("/dashboard/apps");
  revalidatePath("/dashboard/links");
}
