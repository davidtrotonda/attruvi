import { bearerHeaders, ConnectorError, type FetchLike, requestJson } from "./http.js";
import { decimalToMinor, normalizeCurrency } from "./money.js";
import {
  connectorStatus,
  normalizeExternalStatus,
  type AdvertisingConnector,
  type ConnectorAccount,
  type ConnectorAuthContext,
  type ConnectorConnectionTest,
  type ConnectorContext,
  type ConnectorPage,
  type ConnectorStatusInput,
  type NormalizedAdCost,
} from "./types.js";

export const TIKTOK_MARKETING_API_VERSION = "v1.3";
const TIKTOK_BASE_URL = `https://business-api.tiktok.com/open_api/${TIKTOK_MARKETING_API_VERSION}`;

type TikTokResponse<T> = { code?: number; data?: T; message?: string; request_id?: string };
type TikTokAdvertiser = { advertiser_id?: string; advertiser_name?: string; currency?: string; status?: string; timezone?: string };
type TikTokReportRow = {
  dimensions?: { ad_id?: string; adgroup_id?: string; campaign_id?: string; stat_time_day?: string };
  metrics?: {
    ad_name?: string;
    adgroup_name?: string;
    campaign_name?: string;
    clicks?: string;
    currency?: string;
    impressions?: string;
    spend?: string;
  };
};

function tiktokData<T>(response: TikTokResponse<T>): T {
  if (response.code !== 0 || !response.data) {
    const lower = response.message?.toLowerCase() ?? "";
    if (lower.includes("token") || lower.includes("auth")) throw new ConnectorError("token_expired", "TikTok token is invalid or expired.");
    if (lower.includes("rate") || lower.includes("thrott")) throw new ConnectorError("rate_limited", "TikTok rate limit reached.", { retryable: true, retryAfterSeconds: 60 });
    throw new ConnectorError("remote_error", `TikTok API error (${response.code ?? "unknown"}).`);
  }
  return response.data;
}

export class TikTokAdsConnector implements AdvertisingConnector<TikTokReportRow> {
  readonly apiVersion = TIKTOK_MARKETING_API_VERSION;
  readonly provider = "tiktok_ads" as const;
  readonly oauth = {
    apiVersion: TIKTOK_MARKETING_API_VERSION,
    authorizationEndpoint: "https://ads.tiktok.com/marketing_api/auth",
    clientIdEnvironmentName: "TIKTOK_ADS_APP_ID",
    clientSecretEnvironmentName: "TIKTOK_ADS_APP_SECRET",
    scopes: [] as readonly string[],
    tokenEndpoint: `${TIKTOK_BASE_URL}/oauth2/access_token/`,
  } as const;

  constructor(private readonly fetcher: FetchLike = fetch) {}

  status(input: ConnectorStatusInput) {
    return connectorStatus(input);
  }

  async discoverAccounts(context: ConnectorAuthContext): Promise<ConnectorPage<ConnectorAccount>> {
    const url = new URL(`${TIKTOK_BASE_URL}/oauth2/advertiser/get/`);
    if (context.cursor) url.searchParams.set("page", context.cursor);
    url.searchParams.set("page_size", "100");
    const response = await requestJson<TikTokResponse<{ list?: TikTokAdvertiser[]; page_info?: { page?: number; total_page?: number } }>>(
      this.fetcher,
      url,
      { headers: bearerHeaders(context.credentials.accessToken) },
    );
    const data = tiktokData(response);
    const page = data.page_info?.page ?? 1;
    const total = data.page_info?.total_page ?? page;
    return {
      ...(page < total ? { nextCursor: String(page + 1) } : {}),
      rows: (data.list ?? []).flatMap((raw) => raw.advertiser_id ? [{
        ...(raw.currency ? { currency: normalizeCurrency(raw.currency) } : {}),
        externalId: raw.advertiser_id,
        name: raw.advertiser_name || `TikTok Ads ····${raw.advertiser_id.slice(-4)}`,
        status: normalizeExternalStatus(raw.status),
        ...(raw.timezone ? { timezone: raw.timezone } : {}),
      }] : []),
    };
  }

  async testConnection(context: ConnectorAuthContext & { readonly accountExternalId?: string }): Promise<ConnectorConnectionTest> {
    if (!context.accountExternalId) {
      const accounts = await this.discoverAccounts(context);
      return { message: `${accounts.rows.length} cuenta(s) accesible(s).`, ok: true };
    }
    const url = new URL(`${TIKTOK_BASE_URL}/advertiser/info/`);
    url.searchParams.set("advertiser_ids", JSON.stringify([context.accountExternalId]));
    url.searchParams.set("fields", JSON.stringify(["advertiser_id", "name", "currency", "timezone", "status"]));
    const response = await requestJson<TikTokResponse<{ list?: Array<TikTokAdvertiser & { name?: string }> }>>(
      this.fetcher,
      url,
      { headers: bearerHeaders(context.credentials.accessToken) },
    );
    const raw = tiktokData(response).list?.[0];
    return {
      account: {
        ...(raw?.currency ? { currency: normalizeCurrency(raw.currency) } : {}),
        externalId: context.accountExternalId,
        name: raw?.advertiser_name || raw?.name || `TikTok Ads ····${context.accountExternalId.slice(-4)}`,
        status: normalizeExternalStatus(raw?.status),
        ...(raw?.timezone ? { timezone: raw.timezone } : {}),
      },
      message: "Conexión con TikTok Ads verificada.",
      ok: true,
    };
  }

  async fetchCosts(context: ConnectorContext): Promise<ConnectorPage<NormalizedAdCost>> {
    const page = Number(context.cursor ?? "1");
    const url = new URL(`${TIKTOK_BASE_URL}/report/integrated/get/`);
    url.searchParams.set("advertiser_id", context.accountExternalId);
    url.searchParams.set("data_level", "AUCTION_AD");
    url.searchParams.set("report_type", "BASIC");
    url.searchParams.set("dimensions", JSON.stringify(["stat_time_day", "campaign_id", "adgroup_id", "ad_id"]));
    url.searchParams.set("metrics", JSON.stringify(["campaign_name", "adgroup_name", "ad_name", "spend", "currency", "impressions", "clicks"]));
    url.searchParams.set("start_date", context.from);
    url.searchParams.set("end_date", context.to);
    url.searchParams.set("page", String(Number.isFinite(page) && page > 0 ? page : 1));
    url.searchParams.set("page_size", "1000");
    const response = await requestJson<TikTokResponse<{ list?: TikTokReportRow[]; page_info?: { page?: number; total_page?: number } }>>(
      this.fetcher,
      url,
      { headers: bearerHeaders(context.credentials.accessToken) },
    );
    const data = tiktokData(response);
    const currentPage = data.page_info?.page ?? page;
    const total = data.page_info?.total_page ?? currentPage;
    return {
      ...(currentPage < total ? { nextCursor: String(currentPage + 1) } : {}),
      rows: (data.list ?? []).map((row) => this.normalize(row, context)),
    };
  }

  normalize(raw: TikTokReportRow, context: Pick<ConnectorContext, "accountExternalId">): NormalizedAdCost {
    const dimensions = raw.dimensions ?? {};
    const metrics = raw.metrics ?? {};
    const currency = normalizeCurrency(metrics.currency ?? "USD");
    if (!dimensions.stat_time_day) throw new Error("TikTok row is missing stat_time_day.");
    return {
      accountExternalId: context.accountExternalId,
      ...(dimensions.ad_id ? { adExternalId: dimensions.ad_id } : {}),
      ...(dimensions.adgroup_id ? { adGroupExternalId: dimensions.adgroup_id } : {}),
      ...(metrics.adgroup_name ? { adGroupName: metrics.adgroup_name } : {}),
      ...(metrics.ad_name ? { adName: metrics.ad_name } : {}),
      amountMinor: decimalToMinor(metrics.spend ?? "0", currency),
      ...(dimensions.campaign_id ? { campaignExternalId: dimensions.campaign_id } : {}),
      ...(metrics.campaign_name ? { campaignName: metrics.campaign_name } : {}),
      clicks: BigInt(metrics.clicks ?? "0"),
      costDate: dimensions.stat_time_day.slice(0, 10),
      currency,
      entityStatus: "unknown",
      externalRowId: ["tiktok_ads", context.accountExternalId, dimensions.stat_time_day.slice(0, 10), dimensions.campaign_id ?? "-", dimensions.adgroup_id ?? "-", dimensions.ad_id ?? "-"].join(":"),
      impressions: BigInt(metrics.impressions ?? "0"),
      provider: this.provider,
    };
  }
}
