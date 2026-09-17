import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { SmartLinkConfig } from "./contracts";
import { LocalLinkRuntime } from "./local-adapter";
import {
  buildPlayInstallReferrer,
  createSmartLinkHandler,
  detectPlatform,
  isLikelyBot,
  slugFromPath,
} from "./router";

const smartLink: SmartLinkConfig = {
  appId: "20000000-0000-4000-8000-000000000001",
  attributionWindowDays: 7,
  deepLinkPath: "/oferta/verano",
  destinationMode: "auto",
  destinations: {
    android: "https://play.google.com/store/apps/details?id=com.example.demo",
    ios: "https://apps.apple.com/app/id000000000",
    web: "https://example.com/descargar?idioma=es",
  },
  marketing: {
    adGroupId: "grupo-22",
    adGroupName: "Grupo verano",
    adId: "anuncio-34",
    adName: "Vídeo playa",
    affiliateId: null,
    campaignId: "campana-11",
    campaignName: "Verano 2026",
    creatorId: null,
    sourceKind: "tiktok_ads",
  },
  organizationId: "10000000-0000-4000-8000-000000000001",
  slug: "verano-2026",
  smartLinkId: "70000000-0000-4000-8000-000000000001",
  status: "active",
  utm: {
    utm_campaign: "verano_2026",
    utm_medium: "paid_social",
    utm_source: "tiktok",
  },
  version: 1,
};

function request(path: string, userAgent: string, extraHeaders: HeadersInit = {}) {
  return new Request(`https://go.example.com${path}`, {
    headers: {
      "cf-connecting-ip": "203.0.113.42",
      "user-agent": userAgent,
      ...extraHeaders,
    },
  });
}

describe("resolución de enlaces inteligentes", () => {
  it("redirige iOS inmediatamente, sin HTML intermedio", async () => {
    const runtime = new LocalLinkRuntime([smartLink]);
    const response = await createSmartLinkHandler(runtime)(
      request("/verano-2026", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(smartLink.destinations.ios);
    expect(response.headers.get("content-type")).toBeNull();
    expect(await response.text()).toBe("");
    expect(runtime.clicks).toHaveLength(1);
    expect(runtime.clicks[0]).toMatchObject({ destinationPlatform: "ios", platformHint: "ios" });
  });

  it("genera correctamente Play Install Referrer con UTMs y click IDs", async () => {
    const runtime = new LocalLinkRuntime([smartLink]);
    const response = await createSmartLinkHandler(runtime)(
      request(
        "/verano-2026?gclid=google-123&utm_content=v%C3%ADdeo+naranja",
        "Mozilla/5.0 (Linux; Android 15)",
      ),
    );
    const location = new URL(response.headers.get("location") ?? "");
    const referrer = new URLSearchParams(location.searchParams.get("referrer") ?? "");

    expect(location.hostname).toBe("play.google.com");
    expect(referrer.get("attruvi_click_id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(referrer.get("gclid")).toBe("google-123");
    expect(referrer.get("utm_campaign")).toBe("verano_2026");
    expect(referrer.get("utm_content")).toBe("vídeo naranja");
    expect(referrer.get("ad_id")).toBe("anuncio-34");
  });

  it("conserva query strings y Unicode al usar el fallback web", async () => {
    const runtime = new LocalLinkRuntime([smartLink]);
    const response = await createSmartLinkHandler(runtime)(
      request(
        "/verano-2026?utm_term=viajes+M%C3%A9xico&fbclid=meta-456",
        "Mozilla/5.0 (Windows NT 10.0)",
      ),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.searchParams.get("idioma")).toBe("es");
    expect(location.searchParams.get("utm_term")).toBe("viajes México");
    expect(location.searchParams.get("fbclid")).toBe("meta-456");
    expect(location.searchParams.get("deep_link_path")).toBe("/oferta/verano");
  });

  it("usa fallback web cuando la app no tiene destino para el sistema detectado", async () => {
    const linkWithoutIos: SmartLinkConfig = {
      ...smartLink,
      destinations: { android: smartLink.destinations.android, web: smartLink.destinations.web },
    };
    const runtime = new LocalLinkRuntime([linkWithoutIos]);
    const response = await createSmartLinkHandler(runtime)(
      request("/verano-2026", "Mozilla/5.0 (iPhone)"),
    );

    expect(new URL(response.headers.get("location") ?? "").hostname).toBe("example.com");
    expect(runtime.clicks[0]?.destinationPlatform).toBe("web");
  });

  it("responde sin crear clic cuando no existe ningún destino utilizable", async () => {
    const linkWithoutDestination = {
      ...smartLink,
      destinationMode: "web" as const,
      destinations: {},
    };
    const runtime = new LocalLinkRuntime([linkWithoutDestination]);
    const response = await createSmartLinkHandler(runtime)(
      request("/verano-2026", "Mozilla/5.0 (Windows NT 10.0)"),
    );

    expect(response.status).toBe(424);
    expect(runtime.clicks).toHaveLength(0);
  });

  it("falla cerrado para enlaces desactivados o inexistentes", async () => {
    const runtime = new LocalLinkRuntime();
    const response = await createSmartLinkHandler(runtime)(
      request("/enlace-pausado", "Mozilla/5.0"),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ code: "link_unavailable" });
    expect(runtime.clicks).toHaveLength(0);
  });

  it("deduplica clics repetidos y marca bots sin impedir el redirect", async () => {
    const runtime = new LocalLinkRuntime([smartLink]);
    const handler = createSmartLinkHandler(runtime);
    const userAgent = "Googlebot/2.1";
    const first = await handler(request("/verano-2026", userAgent));
    const second = await handler(request("/verano-2026", userAgent));

    expect(first.status).toBe(302);
    expect(second.status).toBe(302);
    expect(runtime.clicks).toHaveLength(1);
    expect(runtime.clicks[0]?.isBot).toBe(true);
  });

  it("libera la deduplicación cuando Queue falla para que el reintento conserve el clic", async () => {
    class FailOnceRuntime extends LocalLinkRuntime {
      attempts = 0;

      override async enqueueClick(message: Parameters<LocalLinkRuntime["enqueueClick"]>[0]) {
        this.attempts += 1;
        if (this.attempts === 1) throw new Error("queue_temporarily_unavailable");
        await super.enqueueClick(message);
      }
    }

    const runtime = new FailOnceRuntime([smartLink]);
    const handler = createSmartLinkHandler(runtime);
    const retryableRequest = () => request("/verano-2026?ttclid=retry-1", "Mozilla/5.0 (Linux; Android 15)");

    await expect(handler(retryableRequest())).rejects.toThrow("queue_temporarily_unavailable");
    const response = await handler(retryableRequest());

    expect(response.status).toBe(302);
    expect(runtime.attempts).toBe(2);
    expect(runtime.clicks).toHaveLength(1);
    expect(runtime.clicks[0]?.ttclid).toBe("retry-1");
  });

  it("resuelve desde el adaptador local con latencia baja", async () => {
    const runtime = new LocalLinkRuntime([smartLink]);
    const started = performance.now();
    const response = await createSmartLinkHandler(runtime)(
      request("/verano-2026", "Mozilla/5.0 (Macintosh)"),
    );
    const elapsed = performance.now() - started;

    expect(response.status).toBe(302);
    expect(elapsed).toBeLessThan(100);
    expect(response.headers.get("server-timing")).toMatch(/^attruvi;dur=/);
  });

  it("no cuenta HEAD y limita abuso por tamaño y slugs reservados", async () => {
    const runtime = new LocalLinkRuntime([smartLink]);
    const handler = createSmartLinkHandler(runtime);
    const headResponse = await handler(
      new Request("https://go.example.com/verano-2026", {
        method: "HEAD",
        headers: { "user-agent": "Mozilla/5.0" },
      }),
    );
    const oversized = await handler(
      request(`/verano-2026?utm_content=${"x".repeat(4_100)}`, "Mozilla/5.0"),
    );
    const reserved = await handler(request("/api", "Mozilla/5.0"));

    expect(headResponse.status).toBe(302);
    expect(runtime.clicks).toHaveLength(0);
    expect(oversized.status).toBe(414);
    expect(reserved.status).toBe(404);
  });
});

describe("utilidades y asociaciones", () => {
  it("detecta plataforma y bots", () => {
    expect(detectPlatform("Mozilla/5.0 (iPad)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Android 15)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("web");
    expect(isLikelyBot("TelegramBot")).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 Safari")).toBe(false);
  });

  it("normaliza rutas y rechaza Unicode inválido en slugs", () => {
    expect(slugFromPath("/r/verano-2026")).toBe("verano-2026");
    expect(slugFromPath("/VERANO-2026")).toBe("verano-2026");
    expect(slugFromPath("/campa%C3%B1a")).toBe("");
    expect(slugFromPath("/r/no/valido")).toBe("");
  });

  it("combina referrer existente sin doble codificación", () => {
    const destination = buildPlayInstallReferrer(
      "https://play.google.com/store/apps/details?id=com.example&referrer=origen%3Dviejo",
      { attruvi_click_id: "click-1", utm_campaign: "otoño" },
    );
    const referrer = new URLSearchParams(new URL(destination).searchParams.get("referrer") ?? "");
    expect(referrer.get("origen")).toBe("viejo");
    expect(referrer.get("utm_campaign")).toBe("otoño");
  });

  it("sirve AASA y assetlinks como JSON versionado", async () => {
    const apple = await exports.default.fetch(
      "https://go.example.com/.well-known/apple-app-site-association",
    );
    const android = await exports.default.fetch(
      "https://go.example.com/.well-known/assetlinks.json",
    );

    expect(apple.status).toBe(200);
    await expect(apple.json()).resolves.toHaveProperty("applinks.details");
    expect(android.status).toBe(200);
    await expect(android.json()).resolves.toEqual([]);
  }, 15_000);
});
