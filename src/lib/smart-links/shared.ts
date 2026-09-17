export const smartLinkSourceKinds = [
  "google_ads",
  "meta_ads",
  "tiktok_ads",
  "affiliate",
  "influencer",
  "organic",
  "other",
] as const;

export type SmartLinkSourceKind = (typeof smartLinkSourceKinds)[number];

export const smartLinkSourceLabels: Record<SmartLinkSourceKind, string> = {
  affiliate: "Afiliado",
  google_ads: "Google Ads",
  influencer: "Influencer",
  meta_ads: "Meta Ads",
  organic: "Orgánico",
  other: "Otro",
  tiktok_ads: "TikTok Ads",
};

export const reservedSmartLinkSlugs = new Set([
  "admin", "api", "app", "assetlinks", "auth", "dashboard", "docs",
  "favicon", "health", "login", "logout", "null", "onboarding",
  "privacy", "r", "robots", "status", "support", "terms", "undefined",
  "well-known", "www",
]);

export type SmartLinkUrlData = {
  adGroupExternalId?: string | null;
  adGroupName?: string | null;
  adExternalId?: string | null;
  adName?: string | null;
  affiliateId?: string | null;
  campaignExternalId?: string | null;
  campaignName?: string | null;
  creatorId?: string | null;
  deepLinkPath?: string | null;
  slug: string;
  sourceKind?: SmartLinkSourceKind | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmMedium?: string | null;
  utmSource?: string | null;
  utmTerm?: string | null;
};

export function slugifySmartLink(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 81);
}
export function smartLinkBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SMART_LINK_BASE_URL?.replace(/\/+$/, "") ??
    "https://links.example.com"
  );
}

export function buildSmartLinkUrl(data: SmartLinkUrlData, test = false) {
  const url = new URL(`/${data.slug}`, `${smartLinkBaseUrl()}/`);
  const values: Record<string, string | null | undefined> = {
    ad_group_id: data.adGroupExternalId,
    ad_group_name: data.adGroupName,
    ad_id: data.adExternalId,
    ad_name: data.adName,
    affiliate_id: data.affiliateId,
    campaign_id: data.campaignExternalId,
    campaign_name: data.campaignName,
    creator_id: data.creatorId,
    deep_link_path: data.deepLinkPath,
    source_kind: data.sourceKind,
    utm_campaign: data.utmCampaign,
    utm_content: data.utmContent,
    utm_medium: data.utmMedium,
    utm_source: data.utmSource,
    utm_term: data.utmTerm,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
  }
  if (test) url.searchParams.set("attruvi_test", "1");
  return url.toString();
}
