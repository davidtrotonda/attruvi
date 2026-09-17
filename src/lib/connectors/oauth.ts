import "server-only";

import type { ConnectorAccount, ConnectorCredentials } from "@attruvi/connectors";
import { createAdvertisingConnector } from "./runtime";
import { providerEnvironment, type RemoteConnectorProvider } from "./catalog";

type TokenResponse = {
  access_token?: string;
  data?: {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    token_type?: string;
  };
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
};

function checkedToken(response: TokenResponse): ConnectorCredentials {
  const payload = response.data ?? response;
  if (!payload.access_token) throw new Error("El proveedor no devolvió un access token.");
  return {
    accessToken: payload.access_token,
    ...(typeof payload.expires_in === "number" ? { expiresAt: new Date(Date.now() + payload.expires_in * 1000).toISOString() } : {}),
    ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
    ...(payload.token_type ? { tokenType: payload.token_type } : { tokenType: "Bearer" }),
  };
}

async function safeJson(response: Response): Promise<TokenResponse> {
  if (!response.ok) throw new Error("El proveedor rechazó el intercambio OAuth.");
  const parsed = await response.json() as TokenResponse;
  return parsed;
}

export function connectorCallbackUrl(provider: RemoteConnectorProvider, origin: string) {
  return new URL(`/api/connectors/${provider}/callback`, origin).toString();
}

export function buildAuthorizationUrl(provider: RemoteConnectorProvider, input: { origin: string; state: string }) {
  const { clientId, configured } = providerEnvironment(provider);
  if (!configured || !clientId) throw new Error("Las credenciales de desarrollador de este proveedor están pendientes.");
  const connector = createAdvertisingConnector(provider);
  if (!connector.oauth) throw new Error("El conector no usa OAuth.");
  const callback = connectorCallbackUrl(provider, input.origin);
  const url = new URL(connector.oauth.authorizationEndpoint);
  if (provider === "tiktok_ads") {
    url.searchParams.set("app_id", clientId);
    url.searchParams.set("redirect_uri", callback);
    url.searchParams.set("state", input.state);
    return url;
  }
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", connector.oauth.scopes.join(" "));
  if (provider === "google_ads") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
  }
  if (provider === "meta_ads") url.searchParams.set("auth_type", "rerequest");
  return url;
}

export async function exchangeAuthorizationCode(provider: RemoteConnectorProvider, code: string, origin: string): Promise<ConnectorCredentials> {
  const { clientId, clientSecret, configured } = providerEnvironment(provider);
  if (!configured || !clientId || !clientSecret) throw new Error("Faltan credenciales de desarrollador.");
  const callback = connectorCallbackUrl(provider, origin);
  if (provider === "google_ads") {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: callback }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    return checkedToken(await safeJson(response));
  }
  if (provider === "meta_ads") {
    const url = new URL("https://graph.facebook.com/v26.0/oauth/access_token");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("client_secret", clientSecret);
    url.searchParams.set("code", code);
    url.searchParams.set("redirect_uri", callback);
    const shortToken = checkedToken(await safeJson(await fetch(url)));
    const longUrl = new URL("https://graph.facebook.com/v26.0/oauth/access_token");
    longUrl.searchParams.set("client_id", clientId);
    longUrl.searchParams.set("client_secret", clientSecret);
    longUrl.searchParams.set("fb_exchange_token", shortToken.accessToken);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    return checkedToken(await safeJson(await fetch(longUrl)));
  }
  const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/", {
    body: JSON.stringify({ app_id: clientId, auth_code: code, secret: clientSecret }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return checkedToken(await safeJson(response));
}

export async function discoverAllAccounts(provider: RemoteConnectorProvider, credentials: ConnectorCredentials): Promise<ConnectorAccount[]> {
  const connector = createAdvertisingConnector(provider);
  const { developerToken } = providerEnvironment(provider);
  const accounts: ConnectorAccount[] = [];
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
    const page = await connector.discoverAccounts({
      credentials,
      ...(cursor ? { cursor } : {}),
      ...(developerToken ? { developerToken } : {}),
    });
    accounts.push(...page.rows);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return accounts;
}
