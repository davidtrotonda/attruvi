import { describe, expect, it } from "vitest";
import { formatDecimalMoney, formatMoneyMinor, formatPercent, formatRatio, periodChange } from "./format";

describe("dashboard metric formatting", () => {
  it("formatea dinero desde unidades menores sin perder céntimos", () => {
    expect(formatMoneyMinor(184099, "EUR")).toMatch(/1840,99\s?€/);
    expect(formatDecimalMoney("1250", "EUR")).toMatch(/12,50\s?€/);
  });

  it("muestra porcentajes y ratios con denominadores ya calculados", () => {
    expect(formatPercent("0.382")).toBe("38,2%");
    expect(formatRatio("2.456")).toBe("2,46×");
  });

  it("compara periodos y trata cero como un caso explícito", () => {
    expect(periodChange(120, 100)).toBeCloseTo(0.2);
    expect(periodChange(0, 0)).toBe(0);
    expect(periodChange(10, 0)).toBeNull();
  });
});
