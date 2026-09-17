import { describe, expect, it } from "vitest";
import { managedAppSchema, smartLinkFormSchema } from "./schemas";
import { buildSmartLinkUrl, slugifySmartLink } from "./shared";

const validLink = {
  adExternalId: "ad-34",
  adGroupExternalId: "group-22",
  adGroupName: "España iOS",
  adName: "Vídeo naranja",
  affiliateId: "",
  androidUrl: "https://play.google.com/store/apps/details?id=com.example.app",
  appId: "20000000-0000-4000-8000-000000000001",
  attributionWindowDays: "7",
  campaignExternalId: "campaign-11",
  campaignName: "Lanzamiento",
  creatorId: "",
  deepLinkPath: "/oferta/verano",
  destinationMode: "auto",
  iosUrl: "https://apps.apple.com/app/id000000000",
  name: "TikTok — vídeo naranja",
  slug: "tiktok-video-naranja",
  smartLinkId: "",
  sourceKind: "tiktok_ads",
  status: "active",
  utmCampaign: "lanzamiento",
  utmContent: "video-naranja",
  utmMedium: "paid_social",
  utmSource: "tiktok",
  utmTerm: "",
  webUrl: "https://example.com/descargar",
};

describe("constructor de enlaces", () => {
  it("convierte nombres Unicode a slugs públicos seguros", () => {
    expect(slugifySmartLink("  Campaña España — Otoño 2026  ")).toBe("campana-espana-otono-2026");
  });

  it("rechaza slugs reservados y jerarquías incompletas", () => {
    const reserved = smartLinkFormSchema.safeParse({ ...validLink, slug: "dashboard" });
    const missingCampaign = smartLinkFormSchema.safeParse({
      ...validLink,
      campaignExternalId: "",
      campaignName: "",
    });
    expect(reserved.success).toBe(false);
    expect(missingCampaign.success).toBe(false);
  });

  it("exige destinos https y una tienda para detección automática", () => {
    expect(smartLinkFormSchema.safeParse({
      ...validLink,
      androidUrl: "",
      iosUrl: "",
      webUrl: "http://inseguro.example.com",
    }).success).toBe(false);
    expect(smartLinkFormSchema.safeParse({
      ...validLink,
      androidUrl: "https://example.com/no-es-google-play",
    }).success).toBe(false);
  });

  it("normaliza la ventana de atribución y conserva los campos válidos", () => {
    const parsed = smartLinkFormSchema.parse(validLink);
    expect(parsed.attributionWindowDays).toBe(7);
    expect(parsed.deepLinkPath).toBe("/oferta/verano");
  });

  it("crea la URL compartible con la jerarquía y marca las pruebas", () => {
    const url = new URL(buildSmartLinkUrl({
      adExternalId: "ad-34",
      campaignName: "Lanzamiento España",
      deepLinkPath: "/oferta/verano",
      slug: "tiktok-video-naranja",
      sourceKind: "tiktok_ads",
      utmContent: "vídeo naranja",
    }, true));
    expect(url.pathname).toBe("/tiktok-video-naranja");
    expect(url.searchParams.get("campaign_name")).toBe("Lanzamiento España");
    expect(url.searchParams.get("utm_content")).toBe("vídeo naranja");
    expect(url.searchParams.get("attruvi_test")).toBe("1");
  });
});

describe("aplicaciones gestionadas", () => {
  it("valida identificadores por plataforma", () => {
    const valid = managedAppSchema.safeParse({
      androidPackageName: "com.example.app",
      appId: "",
      currency: "EUR",
      iosBundleId: "com.example.app",
      name: "Demo",
      platform: "both",
      status: "active",
      timezone: "Europe/Madrid",
    });
    const invalid = managedAppSchema.safeParse({
      androidPackageName: "paquete inválido",
      appId: "",
      currency: "EUR",
      iosBundleId: "sin-puntos",
      name: "Demo",
      platform: "both",
      status: "active",
      timezone: "Europe/Madrid",
    });
    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});
