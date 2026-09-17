import { bearerHeaders, type FetchLike, requestJson } from "./http.js";
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

export const META_MARKETING_API_VERSION = "v26.0";
const META_BASE_URL = `https://graph.facebook.com/${META_MARKETING_API_VERSION}`;

type MetaAccount = { account_currency?: string; account_status?: number; id?: string; name?: string; timezone_name?: string };
type MetaInsight = {
  account_currency?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  clicks?: string;
  date_start?: string;
  impressions?: string;
  spend?: string;
};
type MetaPage<T> = { data?: T[]; paging?: { cursors?: { after?: string }; next?: string } };

function withCursor(url: URL, cursor?: string) {
  if (cursor) url.searchParams.set("after", cursor);
  return url;
}

export class MetaAdsConnector implements AdvertisingConnector<MetaInsight> {
  readonly apiVersion = META_MARKETING_API_VERSION;
  readonly provider = "meta_ads" as const;
  readonly oauth = {
    apiVersion: META_MARKETING_API_VERSION,
    authorizationEndpoint: `https://www.facebook.com/${META_MARKETING_API_VERSION}/dialog/oauth`,
    clientIdEnvironmentName: "META_ADS_APP_ID",
    clientSecretEnvironmentName: "META_ADS_APP_SECRET",
    scopes: ["ads_read", "business_management"],
    tokenEndpoint: `${META_BASE_URL}/oauth/access_token`,
  } as const;

  constructor(private readonly fetcher: FetchLike = fetch) {}

  status(input: ConnectorStatusInput) {
    return connectorStatus(input);
  }

  async discoverAccounts(context: ConnectorAuthContext): Promise<ConnectorPage<ConnectorAccount>> {
    const url = withCursor(new URL(`${META_BASE_URL}/me/adaccounts`), context.cursor);
    url.searchParams.set("fields", "id,name,account_currency,account_status,timezone_name");
    url.searchParams.set("limit", "100");
    const response = await requestJson<MetaPage<MetaAccount>>(this.fetcher, url, { headers: bearerHeaders(context.credentials.accessToken) });
    return {
      ...(response.paging?.cursors?.after && response.paging.next ? { nextCursor: response.paging.cursors.after } : {}),
      rows: (response.data ?? []).flatMap((raw) => {
        if (!raw.id) return [];
        return [{
          ...(raw.account_currency ? { currency: normalizeCurrency(raw.account_currency) } : {}),
          externalId: raw.id.replace(/^act_/, ""),
          name: raw.name || `Meta Ads ····${raw.id.slice(-4)}`,
          status: normalizeExternalStatus(raw.account_status),
          ...(raw.timezone_name ? { timezone: raw.timezone_name } : {}),
        }];
      }),
    };
  }

  async testConnection(context: ConnectorAuthContext & { readonly accountExternalId?: string }): Promise<ConnectorConnectionTest> {
    if (!context.accountExternalId) {
      const accounts = await this.discoverAccounts(context);
      return { message: `${accounts.rows.length} cuenta(s) accesible(s).`, ok: true };
    }
    const id = context.accountExternalId.replace(/^act_/, "");
    const url = new URL(`${META_BASE_URL}/act_${id}`);
    url.searchParams.set("fields", "id,name,account_currency,account_status,timezone_name");
    const raw = await requestJson<MetaAccount>(this.fetcher, url, { headers: bearerHeaders(context.credentials.accessToken) });
    return {
      account: {
        ...(raw.account_currency ? { currency: normalizeCurrency(raw.account_currency) } : {}),
        externalId: id,
        name: raw.name || `Meta Ads ····${id.slice(-4)}`,
        status: normalizeExternalStatus(raw.account_status),
        ...(raw.timezone_name ? { timezone: raw.timezone_name } : {}),
      },
      message: "Conexión con Meta Ads verificada.",
      ok: true,
    };
  }

  async fetchCosts(context: ConnectorContext): Promise<ConnectorPage<NormalizedAdCost>> {
    const id = context.accountExternalId.replace(/^act_/, "");
    const url = withCursor(new URL(`${META_BASE_URL}/act_${id}/insights`), context.cursor);
    url.searchParams.set("fields", "date_start,account_currency,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks");
    url.searchParams.set("level", "ad");
    url.searchParams.set("limit", "500");
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("time_range", JSON.stringify({ since: context.from, until: context.to }));
    const response = await requestJson<MetaPage<MetaInsight>>(this.fetcher, url, { headers: bearerHeaders(context.credentials.accessToken) });
    return {
      ...(response.paging?.cursors?.after && response.paging.next ? { nextCursor: response.paging.cursors.after } : {}),
      rows: (response.data ?? []).map((row) => this.normalize(row, context)),
    };
  }

  normalize(raw: MetaInsight, context: Pick<ConnectorContext, "accountExternalId">): NormalizedAdCost {
    const currency = normalizeCurrency(raw.account_currency ?? "USD");
    if (!raw.date_start) throw new Error("Meta Ads row is missing date_start.");
    return {
      accountExternalId: context.accountExternalId,
      ...(raw.ad_id ? { adExternalId: raw.ad_id } : {}),
      ...(raw.adset_id ? { adGroupExternalId: raw.adset_id } : {}),
      ...(raw.adset_name ? { adGroupName: raw.adset_name } : {}),
      ...(raw.ad_name ? { adName: raw.ad_name } : {}),
      amountMinor: decimalToMinor(raw.spend ?? "0", currency),
      ...(raw.campaign_id ? { campaignExternalId: raw.campaign_id } : {}),
      ...(raw.campaign_name ? { campaignName: raw.campaign_name } : {}),
      clicks: BigInt(raw.clicks ?? "0"),
      costDate: raw.date_start,
      currency,
      entityStatus: "unknown",
      externalRowId: ["meta_ads", context.accountExternalId, raw.date_start, raw.campaign_id ?? "-", raw.adset_id ?? "-", raw.ad_id ?? "-"].join(":"),
      impressions: BigInt(raw.impressions ?? "0"),
      provider: this.provider,
    };
  }
}
