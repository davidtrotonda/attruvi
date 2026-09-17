import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getVerifiedIdentity } from "@/lib/auth/session";
import { discoverAllAccounts, exchangeAuthorizationCode } from "@/lib/connectors/oauth";
import { connectorCatalog, isRemoteConnectorProvider } from "@/lib/connectors/catalog";
import { storeConnectorCredentials } from "@/lib/connectors/secrets";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type StateCookie = { appId?: string; provider?: string; state?: string };

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const url = new URL(request.url);
  if (!isRemoteConnectorProvider(provider)) return NextResponse.redirect(new URL("/dashboard/costs?error=provider", url));
  const cookieStore = await cookies();
  const encodedState = cookieStore.get("attruvi_connector_oauth")?.value;
  cookieStore.delete("attruvi_connector_oauth");
  let saved: StateCookie = {};
  try {
    saved = JSON.parse(Buffer.from(encodedState ?? "", "base64url").toString("utf8")) as StateCookie;
  } catch {
    return NextResponse.redirect(new URL("/dashboard/costs?error=oauth_state", url));
  }
  if (saved.provider !== provider || saved.state !== url.searchParams.get("state") || !saved.appId) {
    return NextResponse.redirect(new URL("/dashboard/costs?error=oauth_state", url));
  }
  const code = url.searchParams.get("code") || url.searchParams.get("auth_code");
  if (!code || url.searchParams.has("error")) return NextResponse.redirect(new URL(`/dashboard/costs?app=${saved.appId}&error=oauth_denied`, url));
  const identity = await getVerifiedIdentity();
  if (!identity) return NextResponse.redirect(new URL("/?auth=required&next=/dashboard/costs", url));
  const userClient = await createSupabaseServerClient();
  const { data: app } = await userClient.from("apps").select("id,organization_id").eq("id", saved.appId).maybeSingle();
  if (!app) return NextResponse.redirect(new URL("/dashboard/costs?error=app", url));

  try {
    const credentials = await exchangeAuthorizationCode(provider, code, url.origin);
    const accounts = await discoverAllAccounts(provider, credentials);
    if (accounts.length === 0) return NextResponse.redirect(new URL(`/dashboard/costs?app=${app.id}&error=no_accounts`, url));
    const service = createSupabaseServiceClient();
    const apiVersion = connectorCatalog[provider].apiVersion;
    for (const account of accounts) {
      const { data: existing } = await service
        .from("connector_accounts")
        .select("id")
        .eq("app_id", app.id)
        .eq("provider", provider)
        .eq("external_account_id", account.externalId)
        .maybeSingle();
      let connectorAccountId = existing?.id as string | undefined;
      const values = {
        account_currency: account.currency ?? null,
        account_name: account.name,
        account_timezone: account.timezone ?? null,
        api_version: apiVersion,
        connection_state: "ready",
        external_account_hint: `····${account.externalId.slice(-4)}`,
        last_error_at: null,
        last_error_code: null,
        last_test_ok: true,
        last_tested_at: new Date().toISOString(),
        status: "active",
        token_expires_at: credentials.expiresAt ?? null,
      };
      if (connectorAccountId) {
        const { error } = await service.from("connector_accounts").update(values).eq("id", connectorAccountId);
        if (error) throw new Error("No se pudo actualizar la cuenta publicitaria.");
      } else {
        const { data: created, error } = await service.from("connector_accounts").insert({
          ...values,
          app_id: app.id,
          external_account_id: account.externalId,
          organization_id: app.organization_id,
          provider,
        }).select("id").single();
        if (error || !created) throw new Error("No se pudo registrar la cuenta publicitaria.");
        connectorAccountId = created.id as string;
      }
      await storeConnectorCredentials(connectorAccountId, credentials);
    }
    const { error: scheduleError } = await service.rpc("schedule_due_connector_syncs", { requested_limit: 100 });
    if (scheduleError) throw new Error("No se pudo programar la primera sincronización.");
    return NextResponse.redirect(new URL(`/dashboard/costs?app=${app.id}&connected=${provider}`, url));
  } catch {
    return NextResponse.redirect(new URL(`/dashboard/costs?app=${app.id}&error=oauth_exchange`, url));
  }
}
