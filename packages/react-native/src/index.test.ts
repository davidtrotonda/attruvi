import { describe, expect, it } from "vitest";

import { parseDirectLink, parseInstallReferrer } from "./attribution.js";
import { AttruviSdkClient, validateConfiguration } from "./client.js";
import { sanitizeProperties } from "./privacy.js";
import { PersistentEventQueue } from "./queue.js";
import type {
  AppStateValue,
  KeyValueStorage,
  RuntimeAdapter,
} from "./runtime.js";
import type { AttruviEvent, AttruviIdentity } from "./types.js";

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  async removeItem(key: string) {
    this.values.delete(key);
  }
}

function event(id: string): AttruviEvent {
  return {
    eventId: id,
    installationId: "10000000-0000-4000-8000-000000000001",
    anonymousId: "20000000-0000-4000-8000-000000000001",
    sessionId: "30000000-0000-4000-8000-000000000001",
    name: "sign_up",
    occurredAt: "2026-09-17T00:00:00.000Z",
    idempotencyKey: `sign_up:${id}`,
    properties: {},
  };
}

interface FakeRuntime extends RuntimeAdapter {
  advance(ms: number): void;
  emitState(state: AppStateValue): Promise<void>;
  readonly payloads: string[];
  status: number;
}

function fakeRuntime(options: { initialUrl?: string; referrer?: string } = {}): FakeRuntime {
  const storage = new MemoryStorage();
  let now = Date.parse("2026-09-17T10:00:00.000Z");
  let uuid = 0;
  let appState: AppStateValue = "active";
  let identity: AttruviIdentity | null = null;
  const appListeners = new Set<(state: AppStateValue) => void>();
  const payloads: string[] = [];
  const runtime: FakeRuntime = {
    platform: "android",
    storage,
    native: {
      async getOrCreateIdentifiers() {
        return {
          installationId: "10000000-0000-4000-8000-000000000001",
          anonymousId: "20000000-0000-4000-8000-000000000001",
        };
      },
      async resetAnonymousId() {
        return {
          installationId: "10000000-0000-4000-8000-000000000001",
          anonymousId: "20000000-0000-4000-8000-000000000099",
        };
      },
      async getInstallReferrer() {
        return options.referrer ? { referrer: options.referrer } : null;
      },
      async getInitialLink() {
        return null;
      },
      async getIdentity() {
        return identity;
      },
      async setIdentity(value) {
        identity = value;
      },
      async clearIdentity() {
        identity = null;
      },
    },
    fetch: async (_input, init) => {
      payloads.push(String(init?.body ?? ""));
      return Response.json(
        { receivedAt: new Date(now + 50).toISOString() },
        { status: runtime.status },
      );
    },
    now: () => now,
    randomUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
    getInitialUrl: async () => options.initialUrl ?? null,
    onUrl: () => ({ remove() {} }),
    getAppState: () => appState,
    onAppStateChanged(listener) {
      appListeners.add(listener);
      return { remove: () => appListeners.delete(listener) };
    },
    setTimeout: () => 1 as unknown as ReturnType<typeof setTimeout>,
    clearTimeout: () => undefined,
    log: () => undefined,
    advance(ms) {
      now += ms;
    },
    async emitState(state) {
      appState = state;
      for (const listener of appListeners) await listener(state);
    },
    payloads,
    status: 202,
  };
  return runtime;
}

const configuration = {
  appKey: "attruvi_test_1234567890",
  endpoint: "https://ingest.example.com/",
  environment: "production" as const,
  consent: "granted" as const,
};

describe("configuración del SDK", () => {
  it("exige HTTPS en producción y normaliza el endpoint", () => {
    expect(validateConfiguration(configuration).endpoint).toBe("https://ingest.example.com");
    expect(() =>
      validateConfiguration({ ...configuration, endpoint: "http://localhost:8787" }),
    ).toThrow(/HTTPS/);
  });
});

describe("cola persistente", () => {
  it("conserva el event_id durante reintentos y confirma solo tras éxito", async () => {
    const queue = new PersistentEventQueue(new MemoryStorage(), "queue", {
      maxEvents: 10,
      maxBytes: 20_000,
      jitter: () => 0,
    });
    await queue.enqueue(event("40000000-0000-4000-8000-000000000001"));
    const first = await queue.peek(10, 0);
    await queue.markFailure(0);
    expect(await queue.peek(10, 499)).toEqual([]);
    const retried = await queue.peek(10, 500);
    expect(retried[0]?.eventId).toBe(first[0]?.eventId);
    await queue.acknowledge([retried[0]!.eventId]);
    expect(await queue.size()).toBe(0);
  });

  it("limita el tamaño descartando primero el evento más antiguo", async () => {
    const queue = new PersistentEventQueue(new MemoryStorage(), "queue", {
      maxEvents: 2,
      maxBytes: 20_000,
    });
    await queue.enqueue(event("40000000-0000-4000-8000-000000000001"));
    await queue.enqueue(event("40000000-0000-4000-8000-000000000002"));
    expect((await queue.enqueue(event("40000000-0000-4000-8000-000000000003"))).dropped).toBe(1);
    expect((await queue.peek(10, 0)).map((item) => item.eventId)).toEqual([
      "40000000-0000-4000-8000-000000000002",
      "40000000-0000-4000-8000-000000000003",
    ]);
  });
});

describe("atribución y privacidad", () => {
  it("lee enlaces y Play Install Referrer sin conservar parámetros arbitrarios", () => {
    expect(
      parseDirectLink(
        "https://links.attruvi.com/verano?utm_source=meta&fbclid=abc&email=no@example.com",
        "2026-09-17T10:00:00.000Z",
      ),
    ).toMatchObject({ method: "direct_link", source: "meta", fbclid: "abc" });
    expect(
      parseInstallReferrer(
        "attruvi_click_id=click-1&utm_campaign=oto%C3%B1o",
        "2026-09-17T10:00:00.000Z",
      ),
    ).toMatchObject({ method: "install_referrer", clickId: "click-1", campaign: "otoño" });
  });

  it("elimina PII y propiedades fuera de allowlist", () => {
    expect(
      sanitizeProperties(
        "checkout",
        { plan: "pro", email: "persona@example.com", ignored: "x" },
        { events: { checkout: ["plan", "email"] } },
      ),
    ).toEqual({ plan: "pro" });
  });
});

describe("ciclo de vida", () => {
  it("no genera identificadores ni eventos hasta recibir consentimiento", async () => {
    const runtime = fakeRuntime();
    const client = new AttruviSdkClient(runtime);
    await client.initialize({ ...configuration, consent: "unknown" });
    expect(await client.track("sign_up")).toBeNull();
    expect(runtime.payloads).toHaveLength(0);
    await client.setConsent("granted");
    await client.flush();
    expect(JSON.parse(runtime.payloads.at(-1)!).events.map((item: AttruviEvent) => item.name)).toEqual(
      expect.arrayContaining(["install", "app_open", "session_start"]),
    );

    runtime.payloads.length = 0;
    await client.setConsent("denied");
    expect(await client.track("sign_up")).toBeNull();
    await client.setConsent("granted");
    await client.flush();
    expect(JSON.parse(runtime.payloads.at(-1)!).events.map((item: AttruviEvent) => item.name)).toEqual(
      expect.arrayContaining(["app_open", "session_start"]),
    );
  });

  it("abre una sesión nueva tras 30 minutos en segundo plano", async () => {
    const runtime = fakeRuntime();
    const client = new AttruviSdkClient(runtime);
    await client.initialize(configuration);
    await client.flush();
    runtime.payloads.length = 0;
    await runtime.emitState("background");
    runtime.advance(31 * 60_000);
    await runtime.emitState("active");
    await client.flush();
    const names = runtime.payloads.flatMap((payload) =>
      (JSON.parse(payload).events as AttruviEvent[]).map((item) => item.name),
    );
    expect(names).toEqual(expect.arrayContaining(["app_open", "session_start"]));
  });

  it("reintenta exactamente el mismo event_id y deduplica compras por transacción", async () => {
    const runtime = fakeRuntime();
    const client = new AttruviSdkClient(runtime);
    await client.initialize({
      ...configuration,
      propertyAllowlist: { events: { purchase: ["transactionId", "valueMinor", "currency"] } },
    });
    await client.flush();
    runtime.payloads.length = 0;
    runtime.status = 503;
    const eventId = await client.track("purchase", {
      transactionId: "order-42",
      valueMinor: 4990,
      currency: "EUR",
    });
    await client.flush();
    const failed = JSON.parse(runtime.payloads.at(-1)!).events[0] as AttruviEvent;
    runtime.status = 202;
    await client.flush();
    const retried = JSON.parse(runtime.payloads.at(-1)!).events[0] as AttruviEvent;
    expect(retried.eventId).toBe(eventId);
    expect(retried.eventId).toBe(failed.eventId);
    expect(retried.idempotencyKey).toBe("purchase:order-42");
  });

  it("notifica cambios de atribución obtenidos al abrir la app", async () => {
    const runtime = fakeRuntime({
      initialUrl: "https://links.attruvi.com/oferta?utm_source=tiktok&ttclid=tiktok-1",
    });
    const client = new AttruviSdkClient(runtime);
    const received: string[] = [];
    client.onAttributionChanged((value) => received.push(value?.source ?? "none"));
    await client.initialize(configuration);
    expect(await client.getAttribution()).toMatchObject({ source: "tiktok", ttclid: "tiktok-1" });
    expect(received).toEqual(["tiktok"]);
  });
});
