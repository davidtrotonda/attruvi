import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("ingest worker", () => {
  it("valida un lote real en el límite HTTP", async () => {
    const response = await exports.default.fetch("https://ingest.example.com/v1/events/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        batchId: "40000000-0000-4000-8000-000000000001",
        events: [
          {
            eventId: "30000000-0000-4000-8000-000000000001",
            appId: "10000000-0000-4000-8000-000000000001",
            installationId: "20000000-0000-4000-8000-000000000001",
            occurredAt: "2026-09-17T10:00:00Z",
            idempotencyKey: "install:demo:001",
            event: {
              name: "install",
              properties: {
                platform: "android",
                sdkVersion: "0.1.0",
              },
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: 1 });
  });

  it("acepta el contrato público del SDK y fija receivedAt en servidor", async () => {
    const response = await exports.default.fetch("https://ingest.example.com/v1/events/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-attruvi-app-key": "attruvi_test_1234567890",
      },
      body: JSON.stringify({
        batchId: "40000000-0000-4000-8000-000000000001",
        sentAt: "2026-09-17T10:00:00Z",
        environment: "production",
        platform: "android",
        sdkVersion: "0.1.0",
        events: [
          {
            eventId: "30000000-0000-4000-8000-000000000001",
            installationId: "20000000-0000-4000-8000-000000000001",
            anonymousId: "21000000-0000-4000-8000-000000000001",
            sessionId: "22000000-0000-4000-8000-000000000001",
            name: "purchase",
            occurredAt: "2026-09-17T10:00:00Z",
            idempotencyKey: "purchase:order-42",
            properties: { transactionId: "order-42", valueMinor: "4990", currency: "EUR" },
          },
        ],
      }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: 1, receivedAt: expect.any(String) });
  });
});
