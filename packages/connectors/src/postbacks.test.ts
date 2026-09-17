import { describe, expect, it, vi } from "vitest";
import {
  GoogleAdsPostbackAdapter,
  MetaPostbackAdapter,
  StrictFakeHttpClient,
  TikTokPostbackAdapter,
  refreshConnectorCredentials,
  type PostbackDestinationConfig,
  type PostbackEvent,
} from "./index.js";

const event: PostbackEvent = {
  click: { fbclid: "fb-click", gclid: "google-click", ttclid: "tt-click" },
  consent: "granted",
  currency: "EUR",
  eventName: "purchase",
  eventTime: "2026-09-17T08:00:00.000Z",
  orderId: "fixture-order",
  providerEventId: "00000000-0000-4000-8000-000000000001",
  valueMinor: 1234n,
};

const config: PostbackDestinationConfig = {
  accountExternalId: "123456",
  apiVersion: "v25",
  credentials: { accessToken: "fixture-token" },
  developerToken: "fixture-developer-token",
  externalConversionId: "789",
  providerEventName: "Purchase",
};

describe("postbacks server-side", () => {
  it("envía a Google con valor exacto y validate_only en la prueba", async () => {
    const expectedConversion = {
      consent: { adUserData: "GRANTED" },
      conversionAction: "customers/123456/conversionActions/789",
      conversionDateTime: "2026-09-17 08:00:00.000+00:00",
      conversionValue: 12.34,
      currencyCode: "EUR",
      gclid: "google-click",
      orderId: "fixture-order",
    };
    const fake = new StrictFakeHttpClient([
      {
        body: { conversions: [expectedConversion], partialFailure: true, validateOnly: false },
        headers: { authorization: "Bearer fixture-token", "developer-token": "fixture-developer-token" },
        method: "POST",
        response: { jobId: "job-1", results: [{ gclid: "google-click" }] },
        url: "https://googleads.googleapis.com/v25/customers/123456:uploadClickConversions",
      },
      {
        body: { conversions: [expectedConversion], partialFailure: true, validateOnly: true },
        method: "POST",
        response: { results: [] },
        url: "https://googleads.googleapis.com/v25/customers/123456:uploadClickConversions",
      },
    ]);
    const adapter = new GoogleAdsPostbackAdapter(fake.fetch);
    await expect(adapter.deliver(config, event)).resolves.toMatchObject({ providerRequestId: "job-1", status: "succeeded" });
    await expect(adapter.testConfiguration(config, event)).resolves.toMatchObject({ mode: "provider_test", ok: true });
    fake.verify();
  });

  it("trata el duplicado de Google como entrega deduplicada", async () => {
    const fake = vi.fn(async () => new Response(JSON.stringify({ partialFailureError: { message: "CLICK_CONVERSION_ALREADY_EXISTS", status: "ALREADY_EXISTS" }, results: [] }), { status: 200 }));
    await expect(new GoogleAdsPostbackAdapter(fake).deliver(config, event)).resolves.toMatchObject({ status: "succeeded" });
  });

  it("usa event_id en Meta y solo prueba con test_event_code", async () => {
    const fake = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.data[0]).toMatchObject({ event_id: event.providerEventId, event_name: "Purchase" });
      expect(body.test_event_code).toBe("TEST42");
      return new Response(JSON.stringify({ events_received: 1, fbtrace_id: "trace-1" }), { status: 200 });
    });
    const result = await new MetaPostbackAdapter(fake).testConfiguration({ ...config, apiVersion: "v26.0", testEventCode: "TEST42" }, event);
    expect(result).toMatchObject({ mode: "provider_test", ok: true });
  });

  it("TikTok valida localmente sin enviar una conversión", async () => {
    const fetcher = vi.fn(async () => new Response("{}"));
    const result = await new TikTokPostbackAdapter(fetcher).testConfiguration({ ...config, apiVersion: "v1.3" }, event);
    expect(result).toMatchObject({ mode: "local_validation", ok: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("clasifica rate limit, token caducado, campo rechazado y caída de red", async () => {
    await expect(new GoogleAdsPostbackAdapter(async () => new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }), { headers: { "retry-after": "31" }, status: 429 })).deliver(config, event)).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 31, retryable: true });
    await expect(new MetaPostbackAdapter(async () => new Response(JSON.stringify({ error: { code: 190 } }), { status: 401 })).deliver({ ...config, apiVersion: "v26.0" }, event)).rejects.toMatchObject({ code: "token_expired" });
    await expect(new TikTokPostbackAdapter(async () => new Response(JSON.stringify({ code: 40002, message: "bad field" }), { status: 400 })).deliver({ ...config, apiVersion: "v1.3" }, event)).rejects.toMatchObject({ code: "field_rejected", retryable: false });
    await expect(new MetaPostbackAdapter(async () => { throw new Error("network"); }).deliver({ ...config, apiVersion: "v26.0" }, event)).rejects.toMatchObject({ code: "network_error", retryable: true });
  });

  it("omite cualquier proveedor cuando no existe consentimiento", async () => {
    const adapter = new GoogleAdsPostbackAdapter(vi.fn());
    await expect(adapter.deliver(config, { ...event, consent: "denied" })).rejects.toMatchObject({ code: "field_rejected", providerCode: "consent_not_granted" });
  });

  it("renueva un token de TikTok con el contrato v1.3", async () => {
    const fake = new StrictFakeHttpClient([{
      body: { client_key: "client", client_secret: "secret", grant_type: "refresh_token", refresh_token: "refresh" },
      method: "POST",
      response: { data: { access_token: "new", expires_in: 3600, refresh_token: "next" } },
      url: "https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/refresh_token/",
    }]);
    const refreshed = await refreshConnectorCredentials({ clientId: "client", clientSecret: "secret", credentials: { accessToken: "old", refreshToken: "refresh" }, provider: "tiktok_ads" }, fake.fetch);
    expect(refreshed).toMatchObject({ accessToken: "new", refreshToken: "next" });
    fake.verify();
  });
});
