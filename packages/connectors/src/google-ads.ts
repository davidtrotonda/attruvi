import { bearerHeaders, type FetchLike, requestJson } from "./http.js";
import { microsToMinor, normalizeCurrency } from "./money.js";
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

export const GOOGLE_ADS_API_VERSION = "v25";
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

type GoogleAdsRow = {
  adGroup?: { id?: string; name?: string; status?: string };
  adGroupAd?: { ad?: { id?: string; name?: string } };
  campaign?: { id?: string; name?: string; status?: string };
  customer?: { currencyCode?: string; descriptiveName?: string; id?: string; status?: string; timeZone?: string };
  metrics?: { clicks?: string; costMicros?: string; impressions?: string };
  segments?: { date?: string };
};

type GoogleSearchResponse = { nextPageToken?: string; results?: GoogleAdsRow[] };
type AccessibleCustomersResponse = { resourceNames?: string[] };

function validDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Google Ads sync dates must use YYYY-MM-DD.");
  return value;
}

function headers(context: ConnectorAuthContext) {
  if (!context.developerToken) throw new Error("Google Ads developer token is required.");
  const extra: Record<string, string> = { "developer-token": context.developerToken, "content-type": "application/json" };
  if (context.loginCustomerId) extra["login-customer-id"] = context.loginCustomerId.replaceAll("-", "");
  return bearerHeaders(context.credentials.accessToken, extra);
}

export class GoogleAdsConnector implements AdvertisingConnector<GoogleAdsRow> {
  readonly apiVersion = GOOGLE_ADS_API_VERSION;
  readonly provider = "google_ads" as const;
  readonly oauth = {
    apiVersion: GOOGLE_ADS_API_VERSION,
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnvironmentName: "GOOGLE_ADS_CLIENT_ID",
    clientSecretEnvironmentName: "GOOGLE_ADS_CLIENT_SECRET",
    scopes: ["https://www.googleapis.com/auth/adwords"],
    tokenEndpoint: "https://oauth2.googleapis.com/token",
  } as const;

  constructor(private readonly fetcher: FetchLike = fetch) {}

  status(input: ConnectorStatusInput) {
    return connectorStatus(input);
  }

  async discoverAccounts(context: ConnectorAuthContext): Promise<ConnectorPage<ConnectorAccount>> {
    const response = await requestJson<AccessibleCustomersResponse>(
      this.fetcher,
      `${GOOGLE_ADS_BASE_URL}/customers:listAccessibleCustomers`,
      { headers: headers(context) },
    );
    const rows = (response.resourceNames ?? []).map((resourceName) => {
      const externalId = resourceName.replace("customers/", "");
      return { externalId, name: `Google Ads ····${externalId.slice(-4)}`, status: "unknown" as const };
    });
    return { rows };
  }

  async testConnection(context: ConnectorAuthContext & { readonly accountExternalId?: string }): Promise<ConnectorConnectionTest> {
    if (!context.accountExternalId) {
      const accounts = await this.discoverAccounts(context);
      return { message: `${accounts.rows.length} cuenta(s) accesible(s).`, ok: true };
    }
    const response = await this.search(context.accountExternalId, context, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status FROM customer LIMIT 1");
    const raw = response.results?.[0]?.customer;
    const externalId = raw?.id ?? context.accountExternalId;
    return {
      account: {
        ...(raw?.currencyCode ? { currency: normalizeCurrency(raw.currencyCode) } : {}),
        externalId,
        name: raw?.descriptiveName || `Google Ads ····${externalId.slice(-4)}`,
        status: normalizeExternalStatus(raw?.status),
        ...(raw?.timeZone ? { timezone: raw.timeZone } : {}),
      },
      message: "Conexión con Google Ads verificada.",
      ok: true,
    };
  }

  async fetchCosts(context: ConnectorContext): Promise<ConnectorPage<NormalizedAdCost>> {
    const query = `SELECT segments.date, customer.currency_code, campaign.id, campaign.name, campaign.status, ad_group.id, ad_group.name, ad_group.status, ad_group_ad.ad.id, ad_group_ad.ad.name, metrics.cost_micros, metrics.impressions, metrics.clicks FROM ad_group_ad WHERE segments.date BETWEEN '${validDate(context.from)}' AND '${validDate(context.to)}' ORDER BY segments.date`;
    const response = await this.search(context.accountExternalId, context, query, context.cursor);
    return {
      ...(response.nextPageToken ? { nextCursor: response.nextPageToken } : {}),
      rows: (response.results ?? []).map((row) => this.normalize(row, context)),
    };
  }

  normalize(raw: GoogleAdsRow, context: Pick<ConnectorContext, "accountExternalId">): NormalizedAdCost {
    const currency = normalizeCurrency(raw.customer?.currencyCode ?? "USD");
    const date = raw.segments?.date;
    if (!date) throw new Error("Google Ads row is missing segments.date.");
    const campaignId = raw.campaign?.id;
    const adGroupId = raw.adGroup?.id;
    const adId = raw.adGroupAd?.ad?.id;
    return {
      accountExternalId: context.accountExternalId,
      ...(adId ? { adExternalId: adId } : {}),
      ...(adGroupId ? { adGroupExternalId: adGroupId } : {}),
      ...(raw.adGroup?.name ? { adGroupName: raw.adGroup.name } : {}),
      ...(raw.adGroupAd?.ad?.name ? { adName: raw.adGroupAd.ad.name } : {}),
      amountMinor: microsToMinor(raw.metrics?.costMicros ?? "0", currency),
      ...(campaignId ? { campaignExternalId: campaignId } : {}),
      ...(raw.campaign?.name ? { campaignName: raw.campaign.name } : {}),
      clicks: BigInt(raw.metrics?.clicks ?? "0"),
      costDate: date,
      currency,
      entityStatus: normalizeExternalStatus(raw.campaign?.status ?? raw.adGroup?.status),
      externalRowId: ["google_ads", context.accountExternalId, date, campaignId ?? "-", adGroupId ?? "-", adId ?? "-"].join(":"),
      impressions: BigInt(raw.metrics?.impressions ?? "0"),
      provider: this.provider,
    };
  }

  private search(accountExternalId: string, context: ConnectorAuthContext, query: string, cursor?: string) {
    return requestJson<GoogleSearchResponse>(
      this.fetcher,
      `${GOOGLE_ADS_BASE_URL}/customers/${accountExternalId.replaceAll("-", "")}/googleAds:search`,
      {
        body: JSON.stringify({ ...(cursor ? { pageToken: cursor } : {}), pageSize: 10_000, query }),
        headers: headers(context),
        method: "POST",
      },
    );
  }
}
