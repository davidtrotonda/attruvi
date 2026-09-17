import { describe, expect, it, vi } from "vitest";

import { divideMetricTotals } from "../../core/src/index.js";
import {
  GoogleAdsPostbackAdapter,
  MetaPostbackAdapter,
  PostbackDeliveryError,
  TikTokPostbackAdapter,
  type PostbackDestinationConfig,
  type PostbackEvent,
} from "../../connectors/src/index.js";
import type { SmartLinkConfig } from "../../../workers/links/src/contracts.js";
import { LocalLinkRuntime } from "../../../workers/links/src/local-adapter.js";
import { createSmartLinkHandler } from "../../../workers/links/src/router.js";
import { AttruviSdkClient } from "./client.js";
import type {
  AppStateValue,
  KeyValueStorage,
  RuntimeAdapter,
} from "./runtime.js";
import type { AttruviEvent, AttruviEventBatch, AttruviIdentity } from "./types.js";

const ORGANIZATION_A = "10000000-0000-4000-8000-000000000001";
const ORGANIZATION_B = "10000000-0000-4000-8000-000000000002";
const APP_A = "20000000-0000-4000-8000-000000000001";
const APP_KEY_A = "attruvi_development_tourixy_fixture";
const APP_KEY_B = "attruvi_development_other_fixture";

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  async removeItem(key: string) {
    this.values.delete(key);
  }
}

class SyntheticIngest {
  private failuresRemaining: number;
  private readonly eventRows = new Map<string, AttruviEvent>();
  readonly acceptedBatches: AttruviEventBatch[] = [];
  attempts = 0;

  constructor(
    private readonly organizationsByAppKey: ReadonlyMap<string, string>,
    failures = 0,
  ) {
    this.failuresRemaining = failures;
  }

  readonly fetch: typeof globalThis.fetch = async (_input, init) => {
    this.attempts += 1;
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      return Response.json({ code: "supabase_temporarily_unavailable" }, { status: 503 });
    }

    const appKey = new Headers(init?.headers).get("x-attruvi-app-key") ?? "";
    const organizationId = this.organizationsByAppKey.get(appKey);
    if (!organizationId) return Response.json({ code: "invalid_app_key" }, { status: 401 });
    const batch = JSON.parse(String(init?.body ?? "{}")) as AttruviEventBatch;
    this.acceptedBatches.push(batch);
    for (const event of batch.events) {
      this.eventRows.set(`${organizationId}:${event.eventId}`, event);
    }
    return Response.json(
      { accepted: batch.events.length, receivedAt: "2026-09-17T10:00:01.000Z" },
      { status: 202 },
    );
  };

  eventsFor(organizationId: string) {
    return [...this.eventRows.entries()]
      .filter(([key]) => key.startsWith(`${organizationId}:`))
      .map(([, event]) => event);
  }
}

interface FixtureRuntime extends RuntimeAdapter {
  readonly identifierCalls: () => number;
  readonly requests: () => number;
}

function createRuntime(
  ingest: SyntheticIngest,
  referrer: string,
): FixtureRuntime {
  const storage = new MemoryStorage();
  let uuid = 0;
  let identity: AttruviIdentity | null = null;
  let identifierCalls = 0;
  let requests = 0;
  const wrappedFetch: typeof globalThis.fetch = async (input, init) => {
    requests += 1;
    return ingest.fetch(input, init);
  };
  return {
    platform: "android",
    storage,
    native: {
      async getOrCreateIdentifiers() {
        identifierCalls += 1;
        return {
          installationId: "30000000-0000-4000-8000-000000000001",
          anonymousId: "40000000-0000-4000-8000-000000000001",
        };
      },
      async resetAnonymousId() {
        return {
          installationId: "30000000-0000-4000-8000-000000000001",
          anonymousId: "40000000-0000-4000-8000-000000000099",
        };
      },
      async getInstallReferrer() {
        return { referrer };
      },
      async getInitialLink() {
        return null;
      },
      async getIdentity() {
        return identity;
      },
      async setIdentity(next) {
        identity = next;
      },
      async clearIdentity() {
        identity = null;
      },
    },
    fetch: wrappedFetch,
    now: () => Date.parse("2026-09-17T10:00:00.000Z"),
    randomUuid: () => `50000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
    getInitialUrl: async () => null,
    onUrl: () => ({ remove() {} }),
    getAppState: () => "active" as AppStateValue,
    onAppStateChanged: () => ({ remove() {} }),
    setTimeout: () => 1 as unknown as ReturnType<typeof setTimeout>,
    clearTimeout: () => undefined,
    log: () => undefined,
    identifierCalls: () => identifierCalls,
    requests: () => requests,
  };
}

const tiktokLink: SmartLinkConfig = {
  appId: APP_A,
  attributionWindowDays: 7,
  deepLinkPath: "/checkout",
  destinationMode: "auto",
  destinations: {
    android: "https://play.google.com/store/apps/details?id=com.example.attruvi.fixture",
    ios: "https://apps.apple.com/app/id000000000",
    web: "https://example.com/download",
  },
  marketing: {
    adGroupId: "tt-group-7",
    adGroupName: "Grupo vídeo",
    adId: "tt-ad-34",
    adName: "Anuncio 34",
    affiliateId: null,
    campaignId: "tt-campaign-11",
    campaignName: "Campaña sintética",
    creatorId: null,
    sourceKind: "tiktok_ads",
  },
  organizationId: ORGANIZATION_A,
  slug: "tiktok-e2e",
  smartLinkId: "70000000-0000-4000-8000-000000000001",
  status: "active",
  utm: {
    utm_campaign: "tiktok_synthetic_2026",
    utm_medium: "paid_social",
    utm_source: "tiktok",
  },
  version: 1,
};

function linkRequest() {
  return new Request("https://go.example.com/tiktok-e2e?ttclid=tt-click-34", {
    headers: {
      "cf-connecting-ip": "203.0.113.42",
      "user-agent": "Mozilla/5.0 (Linux; Android 15)",
    },
  });
}

const postbackConfig: PostbackDestinationConfig = {
  accountExternalId: "fixture-account",
  apiVersion: "v1.3",
  credentials: { accessToken: "fixture-token" },
  developerToken: "fixture-developer-token",
  externalConversionId: "fixture-conversion",
  providerEventName: "Purchase",
  testEventCode: "FIXTURE_TEST",
};

async function classifyPostback(
  provider: "google_ads" | "meta_ads" | "tiktok_ads",
  operation: () => Promise<unknown>,
) {
  try {
    const result = await operation();
    return { provider, status: "eligible" as const, result };
  } catch (error) {
    if (!(error instanceof PostbackDeliveryError)) throw error;
    return { provider, status: "skipped" as const, reason: error.providerCode };
  }
}

describe("E2E sintético de la combinación real objetivo", () => {
  it("conserva el recorrido TikTok → compra → métricas → tres postbacks dry-run", async () => {
    const linkRuntime = new LocalLinkRuntime([tiktokLink]);
    const redirect = await createSmartLinkHandler(linkRuntime)(linkRequest());
    const playUrl = new URL(redirect.headers.get("location") ?? "");
    const installReferrer = playUrl.searchParams.get("referrer") ?? "";

    expect(redirect.status).toBe(302);
    expect(playUrl.hostname).toBe("play.google.com");
    expect(linkRuntime.clicks).toHaveLength(1);
    expect(new URLSearchParams(installReferrer).get("ttclid")).toBe("tt-click-34");

    const ingest = new SyntheticIngest(new Map([
      [APP_KEY_A, ORGANIZATION_A],
      [APP_KEY_B, ORGANIZATION_B],
    ]), 1);
    const runtime = createRuntime(ingest, installReferrer);
    const sdk = new AttruviSdkClient(runtime);
    await sdk.initialize({
      appKey: APP_KEY_A,
      consent: "granted",
      endpoint: "https://ingest.example.com",
      environment: "development",
      purposes: {
        advertising: true,
        analytics: true,
        attribution: true,
        personalization: false,
      },
    });

    const failed = await sdk.flush();
    expect(failed).toMatchObject({ sent: 0 });
    await sdk.identify("tourixy-user-fixture-1");
    await sdk.track("sign_up");
    await sdk.track("purchase", {
      currency: "EUR",
      orderId: "fixture-order-4990",
      transactionId: "fixture-transaction-4990",
      valueMinor: 4990,
    });
    const delivered = await sdk.flush();

    expect(delivered).toMatchObject({ pending: 0, sent: 5 });
    expect(ingest.attempts).toBe(2);
    const events = ingest.eventsFor(ORGANIZATION_A);
    expect(events.filter((event) => event.name === "install")).toHaveLength(1);
    expect(events.filter((event) => event.name === "purchase")).toHaveLength(1);
    expect(events.filter((event) => event.name === "sign_up")).toHaveLength(1);

    const acceptedBatch = ingest.acceptedBatches.at(-1)!;
    expect(acceptedBatch.attribution).toMatchObject({
      adGroupId: "tt-group-7",
      adId: "tt-ad-34",
      campaign: "tiktok_synthetic_2026",
      campaignId: "tt-campaign-11",
      clickId: linkRuntime.clicks[0]?.clickId,
      method: "install_referrer",
      source: "tiktok",
      ttclid: "tt-click-34",
    });

    const duplicateResponse = await ingest.fetch("https://ingest.example.com/v1/events/batch", {
      body: JSON.stringify(acceptedBatch),
      headers: { "x-attruvi-app-key": APP_KEY_A },
      method: "POST",
    });
    expect(duplicateResponse.status).toBe(202);
    expect(ingest.eventsFor(ORGANIZATION_A)).toHaveLength(5);

    const secondOrganizationBatch: AttruviEventBatch = {
      ...acceptedBatch,
      batchId: "80000000-0000-4000-8000-000000000002",
      events: acceptedBatch.events.map((event, index) => ({
        ...event,
        eventId: `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      })),
    };
    await ingest.fetch("https://ingest.example.com/v1/events/batch", {
      body: JSON.stringify(secondOrganizationBatch),
      headers: { "x-attruvi-app-key": APP_KEY_B },
      method: "POST",
    });
    expect(ingest.eventsFor(ORGANIZATION_A)).toHaveLength(5);
    expect(ingest.eventsFor(ORGANIZATION_B)).toHaveLength(5);

    const installs = 1n;
    const buyers = 1n;
    const spendMinor = 1000n;
    const revenueMinor = 4990n;
    expect({
      buyers,
      cac: divideMetricTotals(spendMinor, buyers),
      cpi: divideMetricTotals(spendMinor, installs),
      installs,
      revenueMinor,
      roas: divideMetricTotals(revenueMinor, spendMinor),
    }).toEqual({
      buyers: 1n,
      cac: { denominator: 1n, numerator: 1000n },
      cpi: { denominator: 1n, numerator: 1000n },
      installs: 1n,
      revenueMinor: 4990n,
      roas: { denominator: 1000n, numerator: 4990n },
    });

    const purchase = events.find((event) => event.name === "purchase")!;
    const postbackEvent: PostbackEvent = {
      click: { ttclid: acceptedBatch.attribution!.ttclid! },
      clickOccurredAt: linkRuntime.clicks[0]!.clickedAt,
      consent: "granted",
      currency: "EUR",
      eventName: "purchase",
      eventTime: purchase.occurredAt,
      orderId: "fixture-order-4990",
      providerEventId: purchase.eventId,
      valueMinor: 4990n,
    };
    const unexpectedNetwork = vi.fn(async () => {
      throw new Error("dry-run must not reach the network without an eligible signal");
    });
    const postbacks = await Promise.all([
      classifyPostback("google_ads", () =>
        new GoogleAdsPostbackAdapter(unexpectedNetwork).testConfiguration(
          { ...postbackConfig, apiVersion: "v25" },
          postbackEvent,
        )),
      classifyPostback("meta_ads", () =>
        new MetaPostbackAdapter(unexpectedNetwork).testConfiguration(
          { ...postbackConfig, apiVersion: "v26.0" },
          postbackEvent,
        )),
      classifyPostback("tiktok_ads", () =>
        new TikTokPostbackAdapter(unexpectedNetwork).testConfiguration(postbackConfig, postbackEvent)),
    ]);

    expect(postbacks).toEqual([
      { provider: "google_ads", reason: "missing_google_click_id", status: "skipped" },
      { provider: "meta_ads", reason: "missing_fbclid", status: "skipped" },
      {
        provider: "tiktok_ads",
        result: expect.objectContaining({ mode: "local_validation", ok: true }),
        status: "eligible",
      },
    ]);
    expect(unexpectedNetwork).not.toHaveBeenCalled();
    await sdk.shutdownForTests();
  });

  it("no crea identificadores ni tráfico cuando no existe consentimiento", async () => {
    const ingest = new SyntheticIngest(new Map([[APP_KEY_A, ORGANIZATION_A]]));
    const runtime = createRuntime(ingest, "");
    const sdk = new AttruviSdkClient(runtime);
    await sdk.initialize({
      appKey: APP_KEY_A,
      consent: "unknown",
      endpoint: "https://ingest.example.com",
      environment: "development",
    });

    expect(await sdk.track("sign_up")).toBeNull();
    expect(runtime.identifierCalls()).toBe(0);
    expect(runtime.requests()).toBe(0);
    expect(ingest.eventsFor(ORGANIZATION_A)).toEqual([]);
    await sdk.shutdownForTests();
  });

  it("reintenta una caída temporal en links, ingest, costes, métricas y postbacks", async () => {
    class FailOnceLinkRuntime extends LocalLinkRuntime {
      attempts = 0;
      override async enqueueClick(message: Parameters<LocalLinkRuntime["enqueueClick"]>[0]) {
        this.attempts += 1;
        if (this.attempts === 1) throw new Error("links_temporarily_unavailable");
        await super.enqueueClick(message);
      }
    }
    const links = new FailOnceLinkRuntime([tiktokLink]);
    const handler = createSmartLinkHandler(links);
    await expect(handler(linkRequest())).rejects.toThrow("links_temporarily_unavailable");
    await expect(handler(linkRequest())).resolves.toMatchObject({ status: 302 });
    expect(links.clicks).toHaveLength(1);

    const attempts = new Map<string, number>();
    const retryOnce = async (service: string) => {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        attempts.set(service, attempt);
        try {
          if (attempt === 1) throw new Error(`${service}_temporarily_unavailable`);
          return `${service}_ok`;
        } catch (error) {
          if (attempt === 2) throw error;
        }
      }
      throw new Error("unreachable");
    };

    await expect(Promise.all([
      retryOnce("ingest"),
      retryOnce("costs"),
      retryOnce("metrics"),
      retryOnce("postbacks"),
    ])).resolves.toEqual(["ingest_ok", "costs_ok", "metrics_ok", "postbacks_ok"]);
    expect(Object.fromEntries(attempts)).toEqual({
      costs: 2,
      ingest: 2,
      metrics: 2,
      postbacks: 2,
    });
  });
});
