"use server";

import { createHash, randomUUID } from "node:crypto";
import {
  ManualCostConnector,
  allocateRangeCost,
  decimalToMinor,
  normalizeCurrency,
  parseManualCostCsv,
  type NormalizedAdCost,
} from "@attruvi/connectors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const baseSchema = z.object({
  amount: z.string().trim().max(40).default(""),
  appId: z.uuid(),
  campaignExternalId: z.string().trim().max(255).default(""),
  campaignName: z.string().trim().max(255).default(""),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
  from: z.iso.date(),
  mode: z.enum(["daily", "range", "csv"]),
  to: z.iso.date(),
});

const assignmentSchema = z.object({ appId: z.uuid(), campaignId: z.uuid(), costId: z.uuid() });

function serializable(row: NormalizedAdCost) {
  return { ...row, amountMinor: row.amountMinor.toString(), clicks: row.clicks.toString(), impressions: row.impressions.toString() };
}

function costsUrl(appId: string, params: string) {
  return `/dashboard/costs?app=${encodeURIComponent(appId)}&${params}`;
}

export async function addManualCostsAction(formData: FormData) {
  await requireVerifiedIdentity();
  const parsed = baseSchema.safeParse({
    amount: String(formData.get("amount") ?? ""),
    appId: String(formData.get("app_id") ?? ""),
    campaignExternalId: String(formData.get("campaign_external_id") ?? ""),
    campaignName: String(formData.get("campaign_name") ?? ""),
    currency: String(formData.get("currency") ?? "EUR"),
    from: String(formData.get("from") ?? ""),
    mode: String(formData.get("mode") ?? "daily"),
    to: String(formData.get("to") ?? formData.get("from") ?? ""),
  });
  if (!parsed.success) redirect("/dashboard/costs?error=manual_invalid");

  const input = parsed.data;
  const connector = new ManualCostConnector();
  let rows: ReturnType<typeof serializable>[] = [];
  try {
    if (input.mode === "csv") {
      const file = formData.get("csv");
      if (!(file instanceof File) || file.size === 0 || file.size > 500_000) throw new Error("invalid csv");
      const csv = await file.text();
      const fingerprint = createHash("sha256").update(csv).digest("hex").slice(0, 24);
      rows = parseManualCostCsv(csv).map((row) => serializable(connector.normalize({ ...row, rowId: `${fingerprint}-${row.rowId}` }, { accountExternalId: "manual" })));
    } else {
      const currency = normalizeCurrency(input.currency);
      const total = decimalToMinor(input.amount, currency);
      if (total < BigInt(0)) throw new Error("negative manual cost");
      const range = allocateRangeCost(input.from, input.mode === "daily" ? input.from : input.to, total);
      const entryId = randomUUID();
      rows = range.map(({ amountMinor, date }) => ({
        accountExternalId: "manual",
        amountMinor: amountMinor.toString(),
        ...(input.campaignExternalId ? { campaignExternalId: input.campaignExternalId } : {}),
        ...(input.campaignName ? { campaignName: input.campaignName } : {}),
        clicks: "0",
        costDate: date,
        currency,
        entityStatus: "active" as const,
        externalRowId: `manual:${entryId}:${date}`,
        impressions: "0",
        provider: "manual" as const,
      }));
    }
  } catch {
    redirect(costsUrl(input.appId, "error=manual_invalid"));
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_manual_ad_costs", { requested_app_id: input.appId, requested_rows: rows });
  if (error) redirect(costsUrl(input.appId, "error=manual_save"));
  revalidatePath("/dashboard/costs");
  revalidatePath("/dashboard");
  redirect(costsUrl(input.appId, `manual=${rows.length}`));
}

export async function enqueueCostSyncAction(connectorAccountId: string, appId: string) {
  await requireVerifiedIdentity();
  if (!z.uuid().safeParse(connectorAccountId).success || !z.uuid().safeParse(appId).success) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("enqueue_connector_sync", { requested_connector_account_id: connectorAccountId });
  if (error) redirect(costsUrl(appId, "error=sync"));
  revalidatePath("/dashboard/costs");
  redirect(costsUrl(appId, "sync=queued"));
}

export async function assignCostCampaignAction(formData: FormData) {
  await requireVerifiedIdentity();
  const parsed = assignmentSchema.safeParse({
    appId: String(formData.get("app_id") ?? ""),
    campaignId: String(formData.get("campaign_id") ?? ""),
    costId: String(formData.get("cost_id") ?? ""),
  });
  if (!parsed.success) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_ad_cost_campaign", {
    requested_campaign_id: parsed.data.campaignId,
    requested_cost_id: parsed.data.costId,
  });
  if (error) redirect(costsUrl(parsed.data.appId, "error=assignment"));
  revalidatePath("/dashboard/costs");
  revalidatePath("/dashboard");
  redirect(costsUrl(parsed.data.appId, "assigned=1"));
}
