import { describe, expect, it } from "vitest";
import { dashboardHref, metricLevel, parseDashboardFilters, positivePage, previousPeriod } from "./filters";
import { periodChange } from "./format";

describe("dashboard filters", () => {
  it("normaliza fechas invertidas y valores no permitidos", () => {
    expect(parseDashboardFilters({ environment: "secret", from: "2026-09-20", platform: "windows", to: "2026-09-10" }, new Date("2026-09-30T00:00:00Z"))).toMatchObject({ environment: "production", from: "2026-09-10", platform: undefined, to: "2026-09-20" });
  });

  it("calcula un periodo anterior de igual longitud e inclusivo", () => {
    expect(previousPeriod("2026-09-10", "2026-09-16")).toEqual({ from: "2026-09-03", to: "2026-09-09" });
  });

  it("limita página y jerarquía a opciones seguras", () => {
    expect(positivePage("-8")).toBe(1);
    expect(metricLevel("sql" as never)).toBe("campaign");
    expect(metricLevel("ad_group")).toBe("ad_group");
  });

  it("solo comparte filtros no sensibles en la URL", () => {
    expect(dashboardHref("/dashboard/campaigns", { app: "tourixy", environment: "production", source: "google_ads" })).toBe("/dashboard/campaigns?app=tourixy&environment=production&source=google_ads");
  });

  it("calcula comparaciones sin dividir entre cero", () => {
    expect(periodChange(150, 100)).toBe(0.5);
    expect(periodChange(10, 0)).toBeNull();
    expect(periodChange(0, 0)).toBe(0);
  });
});
