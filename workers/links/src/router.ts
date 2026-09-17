import type {
  ClickMessage,
  DestinationPlatform,
  SmartLinkConfig,
} from "./contracts";

export interface LinkRuntime {
  enqueueClick(message: ClickMessage): Promise<void>;
  hash(value: string): Promise<string>;
  isDuplicate(dedupeKey: string): Promise<boolean>;
  releaseDuplicate(dedupeKey: string): Promise<void>;
  now(): Date;
  resolveLink(slug: string): Promise<SmartLinkConfig | null>;
}
const slugPattern = /^[a-z0-9][a-z0-9-]{1,80}$/;
const maximumRequestUrlLength = 4_096;
const maximumTrackingValueLength = 512;
const duplicateWindowMilliseconds = 20_000;

export const reservedSlugs = new Set([
  "admin", "api", "app", "assetlinks", "auth", "dashboard", "docs",
  "favicon", "health", "login", "logout", "null", "onboarding",
  "privacy", "r", "robots", "status", "support", "terms", "undefined",
  "well-known", "www",
]);

const botPattern =
  /bot|crawler|spider|slurp|preview|headless|facebookexternalhit|telegrambot|discordbot|whatsapp/i;

function noStoreHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

function jsonError(code: string, status: number) {
  return Response.json({ code }, { status, headers: noStoreHeaders() });
}

export function detectPlatform(userAgent = ""): DestinationPlatform {
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  if (/android/i.test(userAgent)) return "android";
  return "web";
}

export function isLikelyBot(userAgent = "") {
  return botPattern.test(userAgent);
}

export function slugFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const encoded =
    parts.length === 1 ? parts[0] : parts.length === 2 && parts[0] === "r" ? parts[1] : "";
  if (!encoded) return "";

  try {
    const slug = decodeURIComponent(encoded).trim().toLowerCase();
    if (!slugPattern.test(slug) || reservedSlugs.has(slug)) return "";
    return slug;
  } catch {
    return "";
  }
}

function cleanTrackingValue(value: string | null) {
  if (!value) return null;
  const cleaned = value.trim().slice(0, maximumTrackingValueLength);
  return cleaned || null;
}

function effectiveUtm(link: SmartLinkConfig, url: URL) {
  const result: Record<string, string> = {};
  for (const key of [
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  ]) {
    const value = cleanTrackingValue(url.searchParams.get(key) ?? link.utm[key] ?? null);
    if (value) result[key] = value;
  }
  return result;
}

function networkPrefix(ipAddress: string) {
  if (ipAddress.includes(".")) return ipAddress.split(".").slice(0, 3).join(".");
  if (ipAddress.includes(":")) return ipAddress.split(":").slice(0, 4).join(":");
  return "unknown";
}

function chooseDestinationPlatform(
  link: SmartLinkConfig,
  detectedPlatform: DestinationPlatform,
): DestinationPlatform {
  if (link.destinationMode !== "auto") return link.destinationMode;
  if (detectedPlatform === "ios" && link.destinations.ios) return "ios";
  if (detectedPlatform === "android" && link.destinations.android) return "android";
  return "web";
}

function destinationFor(link: SmartLinkConfig, platform: DestinationPlatform) {
  if (platform === "ios") return link.destinations.ios ?? link.destinations.web;
  if (platform === "android") return link.destinations.android ?? link.destinations.web;
  return link.destinations.web;
}

export function buildPlayInstallReferrer(
  destination: string,
  referrerParameters: Record<string, string>,
) {
  const target = new URL(destination);
  const existing = new URLSearchParams(target.searchParams.get("referrer") ?? "");
  for (const [key, value] of Object.entries(referrerParameters)) existing.set(key, value);
  target.searchParams.set("referrer", existing.toString());
  return target.toString();
}

function destinationWithAttribution(
  destination: string,
  platform: DestinationPlatform,
  parameters: Record<string, string>,
) {
  if (platform === "android") return buildPlayInstallReferrer(destination, parameters);
  if (platform === "web") {
    const target = new URL(destination);
    for (const [key, value] of Object.entries(parameters)) target.searchParams.set(key, value);
    return target.toString();
  }
  return destination;
}

function clickIdentifiers(url: URL) {
  return {
    fbclid: cleanTrackingValue(url.searchParams.get("fbclid")),
    gbraid: cleanTrackingValue(url.searchParams.get("gbraid")),
    gclid: cleanTrackingValue(url.searchParams.get("gclid")),
    ttclid: cleanTrackingValue(url.searchParams.get("ttclid")),
    wbraid: cleanTrackingValue(url.searchParams.get("wbraid")),
  };
}

function marketingReferrer(link: SmartLinkConfig) {
  const values: Record<string, string> = {};
  const mapping = {
    ad_group_id: link.marketing.adGroupId,
    ad_group_name: link.marketing.adGroupName,
    ad_id: link.marketing.adId,
    ad_name: link.marketing.adName,
    affiliate_id: link.marketing.affiliateId,
    campaign_id: link.marketing.campaignId,
    campaign_name: link.marketing.campaignName,
    creator_id: link.marketing.creatorId,
    source_kind: link.marketing.sourceKind,
  };
  for (const [key, value] of Object.entries(mapping)) {
    if (value) values[key] = value;
  }
  if (link.deepLinkPath) values.deep_link_path = link.deepLinkPath;
  return values;
}

export function createSmartLinkHandler(runtime: LinkRuntime) {
  return async function handleSmartLinkRequest(request: Request): Promise<Response> {
    const startedAt = performance.now();
    if (request.url.length > maximumRequestUrlLength) return jsonError("request_too_large", 414);

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(
        { service: "attruvi-links", status: "ok" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonError("method_not_allowed", 405);
    }

    const slug = slugFromPath(url.pathname);
    if (!slug) return jsonError("link_not_found", 404);
    const link = await runtime.resolveLink(slug);
    if (!link) return jsonError("link_unavailable", 410);

    const userAgent = request.headers.get("user-agent") ?? "";
    const platformHint = detectPlatform(userAgent);
    const destinationPlatform = chooseDestinationPlatform(link, platformHint);
    const destination = destinationFor(link, destinationPlatform);
    if (!destination) return jsonError("destination_unavailable", 424);

    if (request.method === "HEAD") {
      return new Response(null, {
        status: 302,
        headers: { ...noStoreHeaders(), Location: destination },
      });
    }

    const now = runtime.now();
    const clickId = crypto.randomUUID();
    const identifiers = clickIdentifiers(url);
    const utmParameters = effectiveUtm(link, url);
    const referrerParameters: Record<string, string> = {
      attruvi_click_id: clickId,
      ...marketingReferrer(link),
      ...utmParameters,
    };
    for (const [key, value] of Object.entries(identifiers)) {
      if (value) referrerParameters[key] = value;
    }

    const ipAddress = request.headers.get("cf-connecting-ip") ?? "unknown";
    const networkPrefixHash = await runtime.hash(networkPrefix(ipAddress));
    const userAgentHash = await runtime.hash(userAgent.slice(0, 512));
    const bucket = Math.floor(now.getTime() / duplicateWindowMilliseconds);
    const dedupeKey = await runtime.hash(
      `${link.smartLinkId}|${networkPrefixHash}|${userAgentHash}|${bucket}`,
    );

    if (!(await runtime.isDuplicate(dedupeKey))) {
      try {
        await runtime.enqueueClick({
          appId: link.appId,
          clickId,
          clickedAt: now.toISOString(),
          dedupeKey,
          destinationPlatform,
          fbclid: identifiers.fbclid,
          gbraid: identifiers.gbraid,
          gclid: identifiers.gclid,
          isBot: isLikelyBot(userAgent),
          isTest: url.searchParams.get("attruvi_test") === "1",
          networkPrefixHash,
          organizationId: link.organizationId,
          platformHint,
          referrerParameters,
          requestId: clickId,
          smartLinkId: link.smartLinkId,
          ttclid: identifiers.ttclid,
          userAgentHash,
          utmParameters,
          wbraid: identifiers.wbraid,
        });
      } catch (error) {
        // The dedupe claim must not turn a temporary Queue outage into a permanently
        // lost click. Releasing it lets the client or edge retry enqueue the event.
        await runtime.releaseDuplicate(dedupeKey);
        throw error;
      }
    }

    const target = destinationWithAttribution(destination, destinationPlatform, referrerParameters);
    const duration = Math.max(0, performance.now() - startedAt).toFixed(1);
    return new Response(null, {
      status: 302,
      headers: {
        ...noStoreHeaders(),
        Location: target,
        "Server-Timing": `attruvi;dur=${duration}`,
        "X-Attruvi-Click-Id": clickId,
      },
    });
  };
}
