import { describe, expect, it, vi } from "vitest";

import {
  ConnectorError,
  GoogleAdsConnector,
  ManualCostConnector,
  MetaAdsConnector,
  TikTokAdsConnector,
  allocateRangeCost,
  parseManualCostCsv,
  refreshConnectorCredentials,
  requestJson,
} from "./index.js";

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", ...headers }, status });
}

const credentials = { accessToken: "fixture-token" };

describe("conectores de coste publicitario", () => {
  it("continúa la paginación oficial de Meta mediante after", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return json({
        data: [{ account_currency: "EUR", ad_id: "ad-1", ad_name: "Anuncio", adset_id: "set-1", adset_name: "Grupo", campaign_id: "camp-1", campaign_name: "Campaña", clicks: "3", date_start: "2026-09-10", impressions: "40", spend: "12.34" }],
        paging: { cursors: { after: "next-page" }, next: "https://graph.facebook.com/next" },
      });
    });
    const page = await new MetaAdsConnector(fetcher).fetchCosts({ accountExternalId: "1234", credentials, from: "2026-09-10", to: "2026-09-10" });
    expect(page.nextCursor).toBe("next-page");
    expect(page.rows[0]?.amountMinor).toBe(1234n);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("level=ad");
  });

  it("clasifica rate limit y token caducado sin registrar payloads", async () => {
    await expect(requestJson(async () => json({}, 429, { "retry-after": "17" }), "https://fixture.invalid")).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 17, retryable: true });
    await expect(requestJson(async () => json({}, 401), "https://fixture.invalid")).rejects.toMatchObject({ code: "token_expired", retryable: false });
  });

  it("renueva el token de Google conservando el refresh token", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(init?.body)).toContain("grant_type=refresh_token");
      return json({ access_token: "new-access", expires_in: 3600, token_type: "Bearer" });
    });
    const refreshed = await refreshConnectorCredentials({
      clientId: "client",
      clientSecret: "secret",
      credentials: { accessToken: "expired", refreshToken: "keep-me" },
      provider: "google_ads",
    }, fetcher);
    expect(refreshed.accessToken).toBe("new-access");
    expect(refreshed.refreshToken).toBe("keep-me");
  });

  it("reemplaza un dato corregido mediante una externalRowId estable", () => {
    const connector = new MetaAdsConnector();
    const base = { account_currency: "EUR", ad_id: "ad-1", adset_id: "set-1", campaign_id: "camp-1", date_start: "2026-09-10" };
    const first = connector.normalize({ ...base, spend: "10.00" }, { accountExternalId: "123" });
    const corrected = connector.normalize({ ...base, spend: "11.25" }, { accountExternalId: "123" });
    expect(corrected.externalRowId).toBe(first.externalRowId);
    expect(corrected.amountMinor).toBe(1125n);
  });

  it("normaliza monedas sin perder precisión y conserva campañas eliminadas", () => {
    const connector = new GoogleAdsConnector();
    const removed = connector.normalize({
      adGroup: { id: "2", name: "Grupo" },
      adGroupAd: { ad: { id: "3", name: "Anuncio" } },
      campaign: { id: "1", name: "Campaña antigua", status: "REMOVED" },
      customer: { currencyCode: "JPY" },
      metrics: { costMicros: "1500000" },
      segments: { date: "2026-09-11" },
    }, { accountExternalId: "99" });
    expect(removed.amountMinor).toBe(2n);
    expect(removed.campaignExternalId).toBe("1");
    expect(removed.campaignName).toBe("Campaña antigua");
    expect(removed.entityStatus).toBe("deleted");
  });

  it("rechaza CSV inválido y reparte un rango sin perder céntimos", () => {
    expect(() => parseManualCostCsv("date,amount\n2026-09-01,10.00")).toThrow(/currency/);
    expect(() => parseManualCostCsv("date,amount,currency\nno-date,10,EUR")).toThrow(/invalid date/);
    expect(allocateRangeCost("2026-09-01", "2026-09-03", 1000n)).toEqual([
      { amountMinor: 334n, date: "2026-09-01" },
      { amountMinor: 333n, date: "2026-09-02" },
      { amountMinor: 333n, date: "2026-09-03" },
    ]);
  });

  it("limita la carga manual a mil filas", () => {
    const rows = Array.from({ length: 1_001 }, (_, index) => `2026-09-01,${index}.00,EUR`).join("\n");
    expect(() => parseManualCostCsv(`date,amount,currency\n${rows}`)).toThrow(/1,000/);
  });

  it("importa un CSV sanitario con identificadores externos", () => {
    const rows = parseManualCostCsv("date,amount,currency,campaign_id,campaign_name\n2026-09-12,19.90,EUR,c-7,Campaña demo");
    const normalized = new ManualCostConnector().normalize(rows[0]!, { accountExternalId: "manual" });
    expect(normalized.amountMinor).toBe(1990n);
    expect(normalized.campaignExternalId).toBe("c-7");
  });

  it("pagina y normaliza reporting diario de TikTok v1.3", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toContain("/report/integrated/get/");
      return json({ code: 0, data: { list: [{ dimensions: { ad_id: "ad-3", adgroup_id: "group-2", campaign_id: "campaign-1", stat_time_day: "2026-09-13 00:00:00" }, metrics: { ad_name: "Vídeo", adgroup_name: "Grupo", campaign_name: "Campaña", clicks: "12", currency: "EUR", impressions: "900", spend: "7.25" } }], page_info: { page: 1, total_page: 2 } }, message: "OK" });
    });
    const page = await new TikTokAdsConnector(fetcher).fetchCosts({ accountExternalId: "advertiser-1", credentials, from: "2026-09-13", to: "2026-09-13" });
    expect(page.nextCursor).toBe("2");
    expect(page.rows[0]).toMatchObject({ amountMinor: 725n, campaignExternalId: "campaign-1", currency: "EUR" });
  });

  it("expone errores tipados", () => {
    expect(new ConnectorError("configuration", "missing")).toMatchObject({ code: "configuration", retryable: false });
  });
});
