import { expect, it } from "vitest";

import type { AppKeyConfiguration } from "./contracts";
import { createIngestHandler } from "./router";
import { createMemoryRuntime } from "./testing";

const configuration: AppKeyConfiguration = {
  keyId: "11000000-0000-4000-8000-000000000001",
  organizationId: "12000000-0000-4000-8000-000000000001",
  appId: "13000000-0000-4000-8000-000000000001",
  environment: "production",
  status: "active",
  appStatus: "active",
  maxBatchEvents: 100,
  maxRequestBytes: 262_144,
  allowedSdkPrefixes: ["react-native"],
  allowedPlatforms: ["android"],
  attestationMode: "optional",
  cacheTtlSeconds: 60,
  probabilisticEnabled: false,
};

const payload = JSON.stringify({
  batchId: "40000000-0000-4000-8000-000000000001",
  sentAt: "2026-09-17T09:59:59.000Z",
  environment: "production",
  platform: "android",
  sdkVersion: "0.1.0",
  consent: "granted",
  purposes: { advertising: false, analytics: true, attribution: true, personalization: false },
  events: [
    {
      eventId: "30000000-0000-4000-8000-000000000001",
      installationId: "20000000-0000-4000-8000-000000000001",
      anonymousId: "21000000-0000-4000-8000-000000000001",
      sessionId: "22000000-0000-4000-8000-000000000001",
      name: "app_open",
      occurredAt: "2026-09-17T09:58:00.000Z",
      idempotencyKey: "app-open:load-test",
      properties: {},
    },
  ],
});

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

it("mide el camino síncrono validación → cola en memoria", async () => {
  const total = 5_000;
  const concurrency = 100;
  const runtime = createMemoryRuntime({ configuration });
  const handler = createIngestHandler(runtime);
  const latencies: number[] = [];
  const started = performance.now();

  for (let offset = 0; offset < total; offset += concurrency) {
    const responses = await Promise.all(
      Array.from({ length: Math.min(concurrency, total - offset) }, async () => {
        const requestStarted = performance.now();
        const response = await handler(
          new Request("https://ingest.example.com/v1/events/batch", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-attruvi-app-key": "attruvi_load_test_123456",
              "x-attruvi-sdk": "react-native/0.1.0",
              "cf-connecting-ip": "203.0.113.50",
            },
            body: payload,
          }),
        );
        latencies.push(performance.now() - requestStarted);
        return response.status;
      }),
    );
    expect(responses.every((status) => status === 202)).toBe(true);
  }

  const elapsedMs = performance.now() - started;
  const result = {
    requests: total,
    concurrency,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    requestsPerSecond: Number(((total * 1_000) / elapsedMs).toFixed(2)),
    p50Ms: Number(percentile(latencies, 0.5).toFixed(2)),
    p95Ms: Number(percentile(latencies, 0.95).toFixed(2)),
    queued: runtime.queue.messages.length,
  };
  console.log(`ATTRUVI_LOAD_RESULT ${JSON.stringify(result)}`);
  expect(runtime.queue.messages).toHaveLength(total);
}, 60_000);
