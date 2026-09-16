import { describe, expect, it } from "vitest";

import {
  eventEnvelopeSchema,
  moneySchema,
  parseUtcDateTime,
} from "./index.js";

const ids = {
  app: "10000000-0000-4000-8000-000000000001",
  installation: "20000000-0000-4000-8000-000000000001",
  event: "30000000-0000-4000-8000-000000000001",
};

describe("contratos centrales", () => {
  it("normaliza fechas con offset a UTC", () => {
    expect(parseUtcDateTime("2026-09-17T12:00:00+02:00")).toBe(
      "2026-09-17T10:00:00.000Z",
    );
  });

  it("conserva dinero grande sin usar coma flotante", () => {
    const money = moneySchema.parse({
      valueMinor: "9007199254740993123",
      currency: "EUR",
    });

    expect(money.valueMinor).toBe(9007199254740993123n);
  });

  it("valida una compra y rechaza moneda no ISO", () => {
    const purchase = {
      eventId: ids.event,
      appId: ids.app,
      installationId: ids.installation,
      occurredAt: "2026-09-17T10:00:00Z",
      idempotencyKey: "purchase:demo:001",
      event: {
        name: "purchase",
        properties: {
          platform: "android",
          sdkVersion: "0.1.0",
          transactionId: "demo-order-001",
          valueMinor: "4990",
          currency: "EUR",
        },
      },
    };

    expect(eventEnvelopeSchema.parse(purchase).event.name).toBe("purchase");
    expect(
      eventEnvelopeSchema.safeParse({
        ...purchase,
        event: {
          ...purchase.event,
          properties: { ...purchase.event.properties, currency: "euro" },
        },
      }).success,
    ).toBe(false);
  });
});
