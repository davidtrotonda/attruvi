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
});
