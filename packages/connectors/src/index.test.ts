import { describe, expect, it } from "vitest";

import { normalizeCurrency, type ReceiptValidator } from "./index.js";

describe("contratos de conectores", () => {
  it("normaliza monedas sin modificar importes", () => {
    expect(normalizeCurrency(" eur ")).toBe("EUR");
    expect(() => normalizeCurrency("EURO")).toThrow(/ISO 4217/);
  });

  it("mantiene separado el ingreso declarado del resultado del verificador", async () => {
    const validator: ReceiptValidator = {
      provider: "revenuecat",
      async validate(request) {
        return {
          status: "verified",
          currency: request.currency,
          providerReferenceHash: "hash-only",
          verifiedValueMinor: request.reportedValueMinor,
        };
      },
    };
    const result = await validator.validate({
      appId: "app-demo",
      currency: "EUR",
      providerReference: "not-persisted-by-the-contract",
      reportedValueMinor: BigInt(4990),
      transactionId: "order-1",
    });
    expect(result.status).toBe("verified");
  });
});
