import { ConnectorError, type FetchLike, requestJson } from "./http.js";
import type { ConnectorCredentials, ConnectorProvider } from "./types.js";

type RefreshInput = {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly credentials: ConnectorCredentials;
  readonly provider: ConnectorProvider;
};

type GoogleTokenResponse = { access_token?: string; expires_in?: number; refresh_token?: string; token_type?: string };
type TikTokTokenResponse = { access_token?: string; data?: { access_token?: string; expires_in?: number; refresh_token?: string; token_type?: string }; expires_in?: number; refresh_token?: string; token_type?: string };

export async function refreshConnectorCredentials(input: RefreshInput, fetcher: FetchLike = fetch): Promise<ConnectorCredentials> {
  if (!input.credentials.refreshToken) throw new ConnectorError("token_expired", "This connection must be authorized again.");
  if (input.provider === "meta_ads" || input.provider === "manual") throw new ConnectorError("configuration", "This provider does not use an automatic refresh flow in the selected API contract.");
  let token: GoogleTokenResponse;
  if (input.provider === "google_ads") {
    token = await requestJson<GoogleTokenResponse>(fetcher, "https://oauth2.googleapis.com/token", {
        body: new URLSearchParams({
          client_id: input.clientId,
          client_secret: input.clientSecret,
          grant_type: "refresh_token",
          refresh_token: input.credentials.refreshToken,
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      });
  } else {
    const response = await requestJson<TikTokTokenResponse>(fetcher, "https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/refresh_token/", {
        body: JSON.stringify({
          client_key: input.clientId,
          client_secret: input.clientSecret,
          grant_type: "refresh_token",
          refresh_token: input.credentials.refreshToken,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    token = response.data ?? response;
  }
  if (!token.access_token) throw new ConnectorError("invalid_response", "OAuth refresh response did not include an access token.");
  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + Math.max(0, token.expires_in ?? 3600) * 1000).toISOString(),
    refreshToken: token.refresh_token || input.credentials.refreshToken,
    tokenType: token.token_type || input.credentials.tokenType || "Bearer",
  };
}
