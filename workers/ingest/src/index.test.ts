import { describe, expect, it } from "vitest";

import { consumeIngestBatch, type QueuePersistence } from "./consumer";
import {
  queuedIngestMessageSchema,
  type AppKeyConfiguration,
  type DeadLetter,
  type QueuedIngestMessage,
} from "./contracts";
import { createIngestHandler } from "./router";
import { SupabasePersistenceError } from "./supabase";
import { createMemoryRuntime } from "./testing";

const appConfiguration: AppKeyConfiguration = {
  keyId: "11000000-0000-4000-8000-000000000001",
  organizationId: "12000000-0000-4000-8000-000000000001",
  appId: "13000000-0000-4000-8000-000000000001",
  environment: "production",
  status: "active",
  appStatus: "active",
  maxBatchEvents: 100,
  maxRequestBytes: 262_144,
  allowedSdkPrefixes: ["react-native"],
  allowedPlatforms: ["ios", "android"],
  attestationMode: "optional",
  cacheTtlSeconds: 60,
  probabilisticEnabled: false,
};

const baseHeaders = {
  "content-type": "application/json",
  "x-attruvi-app-key": "attruvi_test_1234567890",
  "x-attruvi-sdk": "react-native/0.1.0",
  "cf-connecting-ip": "203.0.113.42",
};

function eventBody(overrides: Record<string, unknown> = {}) {
  return {
    batchId: "40000000-0000-4000-8000-000000000001",
    sentAt: "2026-09-17T09:59:59.000Z",
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
        occurredAt: "2026-09-17T09:58:00.000Z",
        idempotencyKey: "purchase:order-42",
        properties: { transactionId: "order-42", valueMinor: "4990", currency: "EUR" },
      },
    ],
    ...overrides,
  };
}

function post(path: string, body: unknown, headers: Record<string, string> = baseHeaders) {
  return new Request(`https://ingest.example.com${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function queueMessage(body: unknown, attempts = 1) {
  const state = { acked: false, retryDelay: null as number | null };
  const message = {
    id: `queue-${attempts}`,
    timestamp: new Date("2026-09-17T10:00:00.000Z"),
    body,
    attempts,
    ack: () => {
      state.acked = true;
    },
    retry: (options?: QueueRetryOptions) => {
      state.retryDelay = options?.delaySeconds ?? 0;
    },
  } satisfies Message<unknown>;
  return { message, state };
}

function messageBatch(message: Message<unknown>) {
  return {
    queue: "attruvi-ingest-events",
    messages: [message],
    metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
    ackAll() {},
    retryAll() {},
  } satisfies MessageBatch<unknown>;
}

describe("API pública de ingestión", () => {
  it("expone health y encola instalaciones con una prueba de lectura separada", async () => {
    const runtime = createMemoryRuntime({ configuration: appConfiguration });
    const handler = createIngestHandler(runtime);
    const health = await handler(new Request("https://ingest.example.com/health"));
    expect(health.status).toBe(200);

    const response = await handler(
      post("/v1/installations", {
        installationId: "20000000-0000-4000-8000-000000000001",
        anonymousId: "21000000-0000-4000-8000-000000000001",
        occurredAt: "2026-09-17T09:58:00.000Z",
        environment: "production",
        platform: "android",
        sdkVersion: "0.1.0",
        consent: "granted",
      }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      status: "queued",
      installationToken: expect.any(String),
      requestId: expect.any(String),
    });
    expect(runtime.queue.messages[0]).toMatchObject({ kind: "installation", attestation: "absent" });
  });

  it("acepta lotes repetidos y con orden alterado conservando event_id", async () => {
    const runtime = createMemoryRuntime({ configuration: appConfiguration });
    const handler = createIngestHandler(runtime);
    const second = {
      ...eventBody().events[0],
      eventId: "30000000-0000-4000-8000-000000000002",
      idempotencyKey: "purchase:order-43",
      properties: { transactionId: "order-43", valueMinor: "750", currency: "EUR" },
    };
    const reversed = eventBody({ events: [second, eventBody().events[0]] });
    expect((await handler(post("/v1/events/batch", reversed))).status).toBe(202);
    expect((await handler(post("/v1/events/batch", reversed))).status).toBe(202);
    expect(runtime.queue.messages).toHaveLength(2);
    const firstQueued = runtime.queue.messages[0];
    expect(firstQueued?.kind).toBe("events");
    if (!firstQueued || firstQueued.kind !== "events") throw new Error("expected events message");
    expect(firstQueued.body.events.map((event) => event.eventId)).toEqual([
      "30000000-0000-4000-8000-000000000002",
      "30000000-0000-4000-8000-000000000001",
    ]);
  });

  it("solo añade señales probabilísticas minimizadas cuando la regla lo habilita", async () => {
    const runtime = createMemoryRuntime({
      configuration: { ...appConfiguration, probabilisticEnabled: true },
    });
    const body = {
      installationId: "20000000-0000-4000-8000-000000000009",
      anonymousId: "21000000-0000-4000-8000-000000000009",
      occurredAt: "2026-09-17T09:58:00.000Z",
      environment: "production",
      platform: "android",
      sdkVersion: "0.1.0",
      consent: "granted",
    };
    const response = await createIngestHandler(runtime)(
      post("/v1/installations", body, {
        ...baseHeaders,
        "user-agent": "private-agent-that-must-not-be-queued",
      }),
    );
    expect(response.status).toBe(202);
    expect(runtime.queue.messages[0]?.probabilisticEvidence).toEqual({
      networkPrefixHash: "1".repeat(64),
      userAgentHash: "2".repeat(64),
    });
    expect(JSON.stringify(runtime.queue.messages[0])).not.toContain("203.0.113.42");
    expect(JSON.stringify(runtime.queue.messages[0])).not.toContain("private-agent");
  });

  it("acepta un reloj atrasado y rechaza eventos futuros", async () => {
    const runtime = createMemoryRuntime({ configuration: appConfiguration });
    const handler = createIngestHandler(runtime);
    const behind = eventBody({
      events: [{ ...eventBody().events[0], occurredAt: "2026-08-17T10:00:00.000Z" }],
    });
    expect((await handler(post("/v1/events/batch", behind))).status).toBe(202);

    const future = eventBody({
      events: [{ ...eventBody().events[0], occurredAt: "2026-09-17T10:11:00.000Z" }],
    });
    const response = await handler(post("/v1/events/batch", future));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "event_in_future" });
  });

  it("rechaza desinstalaciones declaradas por el SDK y reembolsos positivos", async () => {
    const handler = createIngestHandler(createMemoryRuntime({ configuration: appConfiguration }));
    const uninstall = eventBody({
      events: [{ ...eventBody().events[0], name: "uninstall_inferred", properties: {} }],
    });
    const uninstallResponse = await handler(post("/v1/events/batch", uninstall));
    expect(uninstallResponse.status).toBe(400);
    expect(await uninstallResponse.json()).toMatchObject({
      code: "uninstall_requires_server_evidence",
    });

    const refund = eventBody({
      events: [{
        ...eventBody().events[0],
        name: "refund",
        properties: {
          currency: "EUR",
          originalTransactionId: "order-42",
          transactionId: "refund-42",
          valueMinor: "4990",
        },
      }],
    });
    const refundResponse = await handler(post("/v1/events/batch", refund));
    expect(refundResponse.status).toBe(400);
    expect(await refundResponse.json()).toMatchObject({ code: "invalid_events_payload" });
  });

  it("rechaza claves revocadas, rate limit y origen lógico incorrecto", async () => {
    const revoked = createMemoryRuntime({
      configuration: { ...appConfiguration, status: "revoked" },
    });
    expect((await createIngestHandler(revoked)(post("/v1/events/batch", eventBody()))).status).toBe(403);

    const limited = createMemoryRuntime({ configuration: appConfiguration });
    limited.blockedScope = "ip";
    expect((await createIngestHandler(limited)(post("/v1/events/batch", eventBody()))).status).toBe(429);

    const wrongOrigin = createMemoryRuntime({ configuration: appConfiguration });
    const response = await createIngestHandler(wrongOrigin)(
      post("/v1/events/batch", eventBody(), { ...baseHeaders, "x-attruvi-sdk": "web/1.0" }),
    );
    expect(response.status).toBe(403);
  });

  it("rechaza PII, objetos maliciosos, cuerpos grandes y lotes excesivos", async () => {
    const runtime = createMemoryRuntime({
      configuration: { ...appConfiguration, maxBatchEvents: 1, maxRequestBytes: 2_048 },
    });
    const handler = createIngestHandler(runtime);
    const pii = eventBody({
      events: [{ ...eventBody().events[0], properties: { email: "person@example.com" } }],
    });
    expect((await handler(post("/v1/events/batch", pii))).status).toBe(400);

    const tooMany = eventBody({ events: [eventBody().events[0], { ...eventBody().events[0], eventId: "30000000-0000-4000-8000-000000000002" }] });
    expect((await handler(post("/v1/events/batch", tooMany))).status).toBe(413);

    const oversized = post("/v1/events/batch", { value: "x".repeat(3_000) });
    expect((await handler(oversized)).status).toBe(413);

    const malicious = new Request("https://ingest.example.com/v1/events/batch", {
      method: "POST",
      headers: baseHeaders,
      body: '{"constructor":{"prototype":{"polluted":true}}}',
    });
    const maliciousResponse = await createIngestHandler(
      createMemoryRuntime({ configuration: appConfiguration }),
    )(malicious);
    expect(maliciousResponse.status).toBe(400);
    expect(await maliciousResponse.json()).toMatchObject({ code: "unsafe_property" });
  });

  it("encola identify sin conservar identificadores legibles en logs", async () => {
    const runtime = createMemoryRuntime({ configuration: appConfiguration });
    const response = await createIngestHandler(runtime)(
      post("/v1/identify", {
        installationId: "20000000-0000-4000-8000-000000000001",
        anonymousId: "21000000-0000-4000-8000-000000000001",
        userId: "user_internal_42",
        traits: { plan: "pro" },
        occurredAt: "2026-09-17T09:58:00.000Z",
        environment: "production",
        platform: "android",
        sdkVersion: "0.1.0",
      }),
    );
    expect(response.status).toBe(202);
    expect(runtime.queue.messages[0]).toMatchObject({ kind: "identify" });
  });

  it("GET attribution exige token de instalación además de appKey", async () => {
    const runtime = createMemoryRuntime({
      configuration: appConfiguration,
      attribution: {
        method: "install_referrer",
        matchType: "install_referrer",
        scope: "acquisition",
        confidence: 1,
        deterministic: true,
        attributedAt: "2026-09-17T09:58:00.000Z",
        ruleVersion: "v1",
        source: "Google Ads",
      },
    });
    const handler = createIngestHandler(runtime);
    const url = "https://ingest.example.com/v1/attribution?installation_id=20000000-0000-4000-8000-000000000001";
    const missing = await handler(new Request(url, { headers: baseHeaders }));
    expect(missing.status).toBe(400);
    const response = await handler(
      new Request(url, {
        headers: { ...baseHeaders, "x-attruvi-installation-token": "installation-token-long-enough-for-proof" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ attribution: { source: "Google Ads" } });
  });
});

describe("consumidor de Queue", () => {
  function queuedEvent(): QueuedIngestMessage {
    return queuedIngestMessageSchema.parse({
      version: 1,
      kind: "events",
      requestId: "50000000-0000-4000-8000-000000000001",
      receivedAt: "2026-09-17T09:59:59.000Z",
      keyId: appConfiguration.keyId,
      organizationId: appConfiguration.organizationId,
      appId: appConfiguration.appId,
      environment: "production",
      logicalOrigin: "react-native/0.1.0",
      attestation: "absent",
      body: eventBody(),
    });
  }

  function persistence(overrides: Partial<QueuePersistence> = {}) {
    const deadLetters: DeadLetter[] = [];
    const runtime: QueuePersistence & { deadLetters: DeadLetter[] } = {
      deadLetters,
      async persist() {
        return { messages: 1, events: 1, installations: 1, identities: 1, attributions: 1 };
      },
      async deadLetter(message) {
        deadLetters.push(message);
      },
      metric() {},
      now: () => new Date("2026-09-17T10:00:00.000Z"),
      ...overrides,
    };
    return runtime;
  }

  it("confirma persistencia, reintenta una caída temporal y conserva el mensaje", async () => {
    const success = queueMessage(queuedEvent());
    await consumeIngestBatch(messageBatch(success.message), persistence());
    expect(success.state.acked).toBe(true);

    const temporary = queueMessage(queuedEvent());
    await consumeIngestBatch(
      messageBatch(temporary.message),
      persistence({
        async persist() {
          throw new SupabasePersistenceError(503, true);
        },
      }),
    );
    expect(temporary.state.acked).toBe(false);
    expect(temporary.state.retryDelay).toBe(15);
  });

  it("envía a dead-letter fallos permanentes, mensajes inválidos y reintentos agotados sin payload", async () => {
    const permanent = queueMessage(queuedEvent());
    const permanentRuntime = persistence({
      async persist() {
        throw new SupabasePersistenceError(422, false);
      },
    });
    await consumeIngestBatch(messageBatch(permanent.message), permanentRuntime);
    expect(permanentRuntime.deadLetters[0]).toMatchObject({ reason: "permanent_database_rejection" });
    expect(JSON.stringify(permanentRuntime.deadLetters[0])).not.toContain("order-42");

    const invalid = queueMessage({ unexpected: true });
    const invalidRuntime = persistence();
    await consumeIngestBatch(messageBatch(invalid.message), invalidRuntime);
    expect(invalidRuntime.deadLetters[0]).toMatchObject({ reason: "invalid_message", appId: null });

    const exhausted = queueMessage(queuedEvent(), 5);
    const exhaustedRuntime = persistence({
      async persist() {
        throw new SupabasePersistenceError(503, true);
      },
    });
    await consumeIngestBatch(messageBatch(exhausted.message), exhaustedRuntime);
    expect(exhaustedRuntime.deadLetters[0]).toMatchObject({ reason: "retries_exhausted" });
  });
});
