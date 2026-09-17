import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && provided && expected.length >= 24 && provided === expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const service = createSupabaseServiceClient();
  const { data: settings, error } = await service.from("app_privacy_settings").select("app_id").limit(100);
  if (error) return NextResponse.json({ error: "privacy_settings_unavailable" }, { status: 503 });
  let processed = 0;
  let failed = 0;
  for (const setting of settings ?? []) {
    const { error: retentionError } = await service.rpc("run_app_privacy_retention", {
      dry_run: false,
      requested_app_id: setting.app_id,
    });
    if (retentionError) failed += 1;
    else processed += 1;
  }
  return NextResponse.json({ failed, processed }, { headers: { "Cache-Control": "no-store" }, status: failed > 0 ? 207 : 200 });
}
