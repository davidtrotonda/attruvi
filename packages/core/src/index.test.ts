import { describe, expect, it } from "vitest";

import {
  divideMetricTotals,
  eventEnvelopeSchema,
  metricQuerySchema,
  moneySchema,
  parseUtcDateTime,
  sdkEventEnvelopeSchema,
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

  it("mantiene ratios exactos y representa división por cero como ausencia", () => {
    expect(divideMetricTotals(4_000n, 10_000n)).toEqual({ numerator: 4_000n, denominator: 10_000n });
    expect(divideMetricTotals(4_000n, 0n)).toBeNull();
  });

  it("valida filtros reproducibles de métricas", () => {
    expect(metricQuerySchema.parse({
      appId: ids.app,
      currency: "EUR",
      environment: "production",
      from: "2026-09-01",
      to: "2026-09-17",
    }).level).toBe("source");
    expect(metricQuerySchema.safeParse({
      appId: ids.app,
      currency: "EUR",
      environment: "production",
      from: "2026-09-18",
      to: "2026-09-17",
    }).success).toBe(false);
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

  it("valida productos y exige que los reembolsos sean negativos", () => {
    const base = {
      eventId: ids.event,
      installationId: ids.installation,
      anonymousId: "21000000-0000-4000-8000-000000000001",
      sessionId: "22000000-0000-4000-8000-000000000001",
      occurredAt: "2026-09-17T10:00:00Z",
      idempotencyKey: "refund:demo:001",
      name: "refund",
      properties: {
        transactionId: "refund-001",
        originalTransactionId: "demo-order-001",
        valueMinor: "-4990",
        currency: "EUR",
        quantity: 1,
        products: [{ productId: "premium", quantity: 1 }],
      },
    };

    expect(sdkEventEnvelopeSchema.safeParse(base).success).toBe(true);
    expect(
      sdkEventEnvelopeSchema.safeParse({
        ...base,
        properties: { ...base.properties, valueMinor: "4990" },
      }).success,
    ).toBe(false);
  });
});
