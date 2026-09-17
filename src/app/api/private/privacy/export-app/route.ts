import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { sanitizePrivacyExportRow } from "@/lib/privacy/export";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 300;

const appTables = [
  "app_platforms", "public_sdk_keys", "sources", "campaigns", "ad_groups", "ads",
  "smart_links", "link_destinations", "link_clicks", "installations", "identities",
  "attribution_candidates", "attributions", "events", "sessions", "purchases",
  "subscriptions", "subscription_events", "revenue_ledger", "app_users",
  "app_user_installations", "app_user_metrics", "connector_accounts", "connector_sync_runs",
  "ad_costs", "postback_destinations", "postback_jobs", "postback_attempts", "daily_metrics",
  "app_privacy_settings", "audit_log",
] as const;

export async function GET(request: Request) {
  const identity = await requireVerifiedIdentity();
  const appId = new URL(request.url).searchParams.get("app");
  const parsed = z.uuid().safeParse(appId);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const userClient = await createSupabaseServerClient();
  const { data: app } = await userClient.from("apps").select("id,organization_id,slug").eq("id", parsed.data).maybeSingle();
  if (!app) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: membership } = await userClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", app.organization_id)
    .eq("user_id", identity.id)
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const service = createSupabaseServiceClient();
  await service.from("audit_log").insert({
    action: "privacy.app_exported",
    actor_kind: "user",
    actor_user_id: identity.id,
    app_id: app.id,
    organization_id: app.organization_id,
    target_id: app.id,
    target_table: "apps",
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`${JSON.stringify({ exportedAt: new Date().toISOString(), format: "attruvi-ndjson-v1", scope: "app" })}\n`));
      try {
        for (const table of appTables) {
          for (let from = 0; ; from += 500) {
            const { data, error } = await service.from(table).select("*").eq("app_id", app.id).range(from, from + 499);
            if (error) throw new Error(`export_${table}_failed`);
            for (const row of data ?? []) {
              const sanitizedRow = sanitizePrivacyExportRow(table, row);
              controller.enqueue(encoder.encode(`${JSON.stringify({ row: sanitizedRow, table })}\n`));
            }
            if (!data || data.length < 500) break;
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new NextResponse(stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="attruvi-${app.slug}-export.ndjson"`,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
