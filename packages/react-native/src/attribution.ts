import type { AttruviAttribution } from "./types.js";

const MAX_SIGNAL_LENGTH = 1_024;

function safeValue(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  if (!value) return undefined;
  return value.slice(0, MAX_SIGNAL_LENGTH);
}

function fromParameters(
  params: URLSearchParams,
  method: AttruviAttribution["method"],
  capturedAt: string,
): AttruviAttribution | null {
  const signal = Object.fromEntries(Object.entries({
    method,
    capturedAt,
    clickId: safeValue(params, "attruvi_click_id"),
    source: safeValue(params, "utm_source"),
    medium: safeValue(params, "utm_medium"),
    campaign: safeValue(params, "utm_campaign"),
    content: safeValue(params, "utm_content"),
    term: safeValue(params, "utm_term"),
    campaignId: safeValue(params, "campaign_id"),
    adGroupId: safeValue(params, "ad_group_id"),
    adId: safeValue(params, "ad_id"),
    gclid: safeValue(params, "gclid"),
    gbraid: safeValue(params, "gbraid"),
    wbraid: safeValue(params, "wbraid"),
    fbclid: safeValue(params, "fbclid"),
    ttclid: safeValue(params, "ttclid"),
    deepLinkPath: safeValue(params, "deep_link_path"),
  }).filter(([, entry]) => entry !== undefined)) as unknown as AttruviAttribution;
  return Object.keys(signal).length > 2 ? signal : null;
}

export function parseDirectLink(url: string, capturedAt: string): AttruviAttribution | null {
  try {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search);
    if (!params.has("deep_link_path") && parsed.pathname && parsed.pathname !== "/") {
      params.set("deep_link_path", parsed.pathname);
    }
    return fromParameters(params, "direct_link", capturedAt);
  } catch {
    return null;
  }
}

export function parseInstallReferrer(
  referrer: string,
  capturedAt: string,
): AttruviAttribution | null {
  try {
    return fromParameters(new URLSearchParams(referrer), "install_referrer", capturedAt);
  } catch {
    return null;
  }
}

export function sameAttribution(
  left: AttruviAttribution | null,
  right: AttruviAttribution | null,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
