import { ConnectorError, type FetchLike, requestJson } from "./http.js";
import type { ConnectorCredentials, ConnectorProvider } from "./types.js";

type RefreshInput = {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly credentials: ConnectorCredentials;
  readonly provider: ConnectorProvider;
};

type GoogleTokenResponse = { access_token?: string; expires_in?: number; refresh_token?: string; token_type?: string };

export async function refreshConnectorCredentials(input: RefreshInput, fetcher: FetchLike = fetch): Promise<ConnectorCredentials> {
  if (!input.credentials.refreshToken) throw new ConnectorError("token_expired", "This connection must be authorized again.");
  if (input.provider !== "google_ads") throw new ConnectorError("configuration", "This provider does not use an automatic refresh flow in the selected API contract.");
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.credentials.refreshToken,
  });
  const response = await requestJson<GoogleTokenResponse>(fetcher, "https://oauth2.googleapis.com/token", {
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!response.access_token) throw new ConnectorError("invalid_response", "OAuth refresh response did not include an access token.");
  return {
    accessToken: response.access_token,
    expiresAt: new Date(Date.now() + Math.max(0, response.expires_in ?? 3600) * 1000).toISOString(),
    refreshToken: response.refresh_token || input.credentials.refreshToken,
    tokenType: response.token_type || input.credentials.tokenType || "Bearer",
  };
}
