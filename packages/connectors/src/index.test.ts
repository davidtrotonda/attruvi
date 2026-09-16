import { describe, expect, it } from "vitest";

import { normalizeCurrency } from "./index.js";

describe("contratos de conectores", () => {
  it("normaliza monedas sin modificar importes", () => {
    expect(normalizeCurrency(" eur ")).toBe("EUR");
    expect(() => normalizeCurrency("EURO")).toThrow(/ISO 4217/);
  });
});
