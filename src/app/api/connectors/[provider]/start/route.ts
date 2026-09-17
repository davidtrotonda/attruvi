import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getVerifiedIdentity } from "@/lib/auth/session";
import { buildAuthorizationUrl } from "@/lib/connectors/oauth";
import { isRemoteConnectorProvider, providerEnvironment } from "@/lib/connectors/catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const url = new URL(request.url);
  if (!isRemoteConnectorProvider(provider)) return NextResponse.redirect(new URL("/dashboard/costs?error=provider", url));
  const identity = await getVerifiedIdentity();
  if (!identity) return NextResponse.redirect(new URL(`/?auth=required&next=${encodeURIComponent(url.pathname + url.search)}`, url));
  const appId = url.searchParams.get("app") ?? "";
  const client = await createSupabaseServerClient();
  const { data: app } = await client.from("apps").select("id").eq("id", appId).maybeSingle();
  if (!app) return NextResponse.redirect(new URL("/dashboard/costs?error=app", url));
  const environment = providerEnvironment(provider);
  if (!environment.configured) return NextResponse.redirect(new URL(`/dashboard/costs?app=${app.id}&setup=${provider}`, url));

  const state = randomBytes(32).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set("attruvi_connector_oauth", Buffer.from(JSON.stringify({ appId: app.id, provider, state })).toString("base64url"), {
    httpOnly: true,
    maxAge: 600,
    path: "/api/connectors",
    sameSite: "lax",
    secure: url.protocol === "https:",
  });
  const authorization = buildAuthorizationUrl(provider, { origin: url.origin, state });
  return NextResponse.redirect(authorization);
}
