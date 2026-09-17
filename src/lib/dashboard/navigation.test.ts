import { describe, expect, it } from "vitest";
import { dashboardNavigation } from "./navigation";

describe("dashboard navigation", () => {
  it("expone todas las decisiones principales en el orden acordado", () => {
    expect(dashboardNavigation.map((item) => item.label)).toEqual([
      "Resumen",
      "Adquisición",
      "Campañas",
      "Usuarios",
      "Enlaces",
      "Eventos",
      "Postbacks",
      "Integraciones",
      "Ajustes",
    ]);
  });

  it("utiliza rutas únicas y compartibles", () => {
    const routes = dashboardNavigation.map((item) => item.href);
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes.every((route) => route.startsWith("/dashboard"))).toBe(true);
  });
});
