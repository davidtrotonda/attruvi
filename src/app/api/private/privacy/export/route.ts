import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const querySchema = z.object({ app: z.uuid(), appUser: z.uuid() });

export async function GET(request: Request) {
  await requireVerifiedIdentity();
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ app: url.searchParams.get("app"), appUser: url.searchParams.get("app_user") });
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("export_app_user_data", {
    requested_app_id: parsed.data.app,
    requested_app_user_id: parsed.data.appUser,
  });
  if (error) {
    return NextResponse.json(
      { error: error.code === "42501" ? "forbidden" : "export_failed" },
      { status: error.code === "42501" ? 403 : 500 },
    );
  }
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="attruvi-user-export.json"',
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
