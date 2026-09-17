import { parseDirectLink, parseInstallReferrer, sameAttribution } from "./attribution.js";
import { sanitizeProperties, sanitizeTraits, validateEvent } from "./privacy.js";
import { PersistentEventQueue } from "./queue.js";
import type {
  AppStateValue,
  PersistedSdkState,
  RuntimeAdapter,
  SecureIdentifiers,
  Subscription,
} from "./runtime.js";
import type {
  AttruviAttribution,
  AttruviConfiguration,
  AttruviEvent,
  AttruviEventBatch,
  AttributionListener,
  ConsentState,
  EventProperties,
  FlushResult,
  TrackOptions,
} from "./types.js";

export const ATTRUVI_SDK_VERSION = "0.1.0";

interface NormalizedConfiguration extends AttruviConfiguration {
  readonly endpoint: string;
  readonly sessionTimeoutMs: number;
  readonly flushAt: number;
  readonly flushIntervalMs: number;
  readonly maxQueueEvents: number;
  readonly maxQueueBytes: number;
  readonly requestTimeoutMs: number;
}

const DEFAULT_STATE: PersistedSdkState = {
  version: 1,
  consent: "unknown",
  installTracked: false,
  lastBackgroundAt: null,
};

function storageNamespace(appKey: string): string {
  return `@attruvi/${appKey.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

function parseState(value: string | null, configuredConsent: ConsentState): PersistedSdkState {
  if (!value) return { ...DEFAULT_STATE, consent: configuredConsent };
  try {
    const parsed = JSON.parse(value) as Partial<PersistedSdkState>;
    return {
      version: 1,
      consent:
        parsed.consent === "granted" || parsed.consent === "denied" || parsed.consent === "unknown"
          ? parsed.consent
          : configuredConsent,
      installTracked: parsed.installTracked === true,
      lastBackgroundAt:
        typeof parsed.lastBackgroundAt === "number" && Number.isFinite(parsed.lastBackgroundAt)
          ? parsed.lastBackgroundAt
          : null,
    };
  } catch {
    return { ...DEFAULT_STATE, consent: configuredConsent };
  }
}

export function validateConfiguration(input: AttruviConfiguration): NormalizedConfiguration {
  if (!/^attruvi_[A-Za-z0-9_-]{8,}$/.test(input.appKey)) {
    throw new Error("appKey debe comenzar por attruvi_ y ser una clave pública válida");
  }
  const endpoint = new URL(input.endpoint);
  if (input.environment === "production" && endpoint.protocol !== "https:") {
    throw new Error("El endpoint de producción debe usar HTTPS");
  }
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
    throw new Error("El endpoint debe usar HTTP o HTTPS");
  }
  const sessionTimeoutMs = input.sessionTimeoutMs ?? 30 * 60_000;
  const flushAt = input.flushAt ?? 20;
  const flushIntervalMs = input.flushIntervalMs ?? 15_000;
  const maxQueueEvents = input.maxQueueEvents ?? 1_000;
  const maxQueueBytes = input.maxQueueBytes ?? 2_000_000;
  const requestTimeoutMs = input.requestTimeoutMs ?? 15_000;
  if (sessionTimeoutMs < 60_000) throw new Error("sessionTimeoutMs no puede ser menor de un minuto");
  if (flushAt < 1 || flushAt > 100) throw new Error("flushAt debe estar entre 1 y 100");
  if (maxQueueEvents < flushAt) throw new Error("maxQueueEvents debe ser mayor o igual que flushAt");

  return {
    ...input,
    endpoint: endpoint.toString().replace(/\/$/, ""),
    sessionTimeoutMs,
    flushAt,
    flushIntervalMs,
    maxQueueEvents,
    maxQueueBytes,
    requestTimeoutMs,
  };
}

export class AttruviSdkClient {
  private configuration: NormalizedConfiguration | null = null;
  private queue: PersistentEventQueue | null = null;
  private state: PersistedSdkState = DEFAULT_STATE;
  private identifiers: SecureIdentifiers | null = null;
  private attribution: AttruviAttribution | null = null;
  private sessionId: string | null = null;
  private appState: AppStateValue = "unknown";
  private initialized = false;
  private bootstrapped = false;
  private flushPromise: Promise<FlushResult> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriptions: Subscription[] = [];
  private readonly attributionListeners = new Set<AttributionListener>();

  constructor(private readonly runtime: RuntimeAdapter) {}

  async initialize(input: AttruviConfiguration): Promise<void> {
    const configuration = validateConfiguration(input);
    if (this.initialized) {
      if (this.configuration?.appKey !== configuration.appKey) {
        throw new Error("Attruvi ya está inicializado con otra appKey");
      }
      return;
    }

    this.configuration = configuration;
    const namespace = storageNamespace(configuration.appKey);
    this.state = parseState(await this.runtime.storage.getItem(`${namespace}/state`), input.consent);
    if (this.state.consent === "unknown" && input.consent !== "unknown") {
      this.state = { ...this.state, consent: input.consent };
    }
    this.queue = new PersistentEventQueue(this.runtime.storage, `${namespace}/queue`, {
      maxEvents: configuration.maxQueueEvents,
      maxBytes: configuration.maxQueueBytes,
    });
    this.attribution = await this.readAttribution(`${namespace}/attribution`);
    this.appState = this.runtime.getAppState();
    this.subscriptions = [
      this.runtime.onUrl((url) => this.captureDirectLink(url)),
      this.runtime.onAppStateChanged((state) => this.handleAppState(state)),
    ];
    this.initialized = true;
    await this.persistState();

    if (this.state.consent === "granted") await this.bootstrapTracking();
  }

  async track(
    name: string,
    properties: EventProperties = {},
    options: TrackOptions = {},
  ): Promise<string | null> {
    this.assertInitialized();
    if (this.state.consent !== "granted") return null;
    await this.ensureIdentifiers();
    if (!this.sessionId) this.sessionId = this.runtime.randomUuid();

    const sanitized = sanitizeProperties(name, properties, this.configuration!.propertyAllowlist);
    validateEvent(name, sanitized);
    const eventId = options.eventId ?? this.runtime.randomUuid();
    const businessId = sanitized.transactionId;
    const idempotencyKey =
      options.idempotencyKey ??
      (typeof businessId === "string" ? `${name}:${businessId}` : `${name}:${eventId}`);
    if (idempotencyKey.length < 8 || idempotencyKey.length > 255) {
      throw new Error("idempotencyKey debe tener entre 8 y 255 caracteres");
    }

    const event: AttruviEvent = {
      eventId,
      installationId: this.identifiers!.installationId,
      anonymousId: this.identifiers!.anonymousId,
      sessionId: this.sessionId,
      name,
      occurredAt: new Date(this.runtime.now()).toISOString(),
      idempotencyKey,
      properties: sanitized,
    };
    const { dropped } = await this.queue!.enqueue(event);
    if (dropped > 0) {
      this.runtime.log("warn", "La cola alcanzó su límite; se descartaron los eventos más antiguos", {
        dropped,
      });
    }
    const pending = await this.queue!.size();
    if (options.flush === true || pending >= this.configuration!.flushAt) {
      void this.flushInternal(false);
    } else {
      this.scheduleFlush(this.configuration!.flushIntervalMs);
    }
    return eventId;
  }

  async identify(userId: string, traits: EventProperties = {}): Promise<void> {
    this.assertInitialized();
    if (this.state.consent !== "granted") return;
    const normalized = userId.trim();
    if (normalized.length < 1 || normalized.length > 255) {
      throw new Error("userId debe tener entre 1 y 255 caracteres");
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || /^\+?[\d\s().-]{8,}$/.test(normalized)) {
      throw new Error("Usa un identificador interno opaco; no envíes correo ni teléfono como userId");
    }
    await this.runtime.native.setIdentity({
      userId: normalized,
      traits: sanitizeTraits(traits, this.configuration!.propertyAllowlist),
    });
  }

  async resetIdentity(): Promise<void> {
    this.assertInitialized();
    if (this.state.consent === "granted") {
      try {
        await this.flush();
      } catch {
        // El reset de privacidad no puede quedar bloqueado por falta de red.
      }
    }
    await this.runtime.native.clearIdentity();
    this.identifiers = await this.runtime.native.resetAnonymousId();
  }

  async setConsent(consent: ConsentState): Promise<void> {
    this.assertInitialized();
    if (this.state.consent === consent) return;
    this.state = { ...this.state, consent };
    await this.persistState();
    if (consent === "granted") {
      await this.bootstrapTracking();
      return;
    }
    this.cancelFlushTimer();
    this.bootstrapped = false;
    this.sessionId = null;
    await this.queue!.clear();
    await this.runtime.native.clearIdentity();
    this.identifiers = null;
    if (consent === "denied") {
      this.attribution = null;
      await this.runtime.storage.removeItem(`${storageNamespace(this.configuration!.appKey)}/attribution`);
      this.emitAttribution();
    }
  }

  async getAttribution(): Promise<AttruviAttribution | null> {
    this.assertInitialized();
    return this.attribution;
  }

  async flush(): Promise<FlushResult> {
    this.assertInitialized();
    await this.queue!.resetBackoff();
    return this.flushInternal(true);
  }

  onAttributionChanged(listener: AttributionListener): () => void {
    this.attributionListeners.add(listener);
    return () => this.attributionListeners.delete(listener);
  }

  async shutdownForTests(): Promise<void> {
    this.cancelFlushTimer();
    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions = [];
  }

  private assertInitialized(): void {
    if (!this.initialized || !this.configuration || !this.queue) {
      throw new Error("Llama a Attruvi.initialize(...) antes de usar el SDK");
    }
  }

  private async bootstrapTracking(): Promise<void> {
    if (this.bootstrapped || this.state.consent !== "granted") return;
    await this.ensureIdentifiers();
    await this.captureInitialAttribution();
    this.sessionId = this.runtime.randomUuid();
    if (!this.state.installTracked) {
      await this.track("install", {}, { idempotencyKey: `install:${this.identifiers!.installationId}` });
      this.state = { ...this.state, installTracked: true };
      await this.persistState();
    }
    await this.track("app_open");
    await this.track("session_start", {}, { idempotencyKey: `session:${this.sessionId}` });
    this.bootstrapped = true;
    void this.flushInternal(false);
  }

  private async ensureIdentifiers(): Promise<void> {
    this.identifiers ??= await this.runtime.native.getOrCreateIdentifiers();
  }

  private async persistState(): Promise<void> {
    if (!this.configuration) return;
    await this.runtime.storage.setItem(
      `${storageNamespace(this.configuration.appKey)}/state`,
      JSON.stringify(this.state),
    );
  }

  private async readAttribution(key: string): Promise<AttruviAttribution | null> {
    const value = await this.runtime.storage.getItem(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as AttruviAttribution;
    } catch {
      return null;
    }
  }

  private async captureInitialAttribution(): Promise<void> {
    const nativeUrl = await this.runtime.native.getInitialLink();
    const jsUrl = await this.runtime.getInitialUrl();
    const url = jsUrl ?? nativeUrl;
    if (url) await this.captureDirectLink(url);
    if (this.runtime.platform === "android" && !this.attribution?.clickId) {
      const referrer = await this.runtime.native.getInstallReferrer();
      if (referrer?.referrer) {
        await this.setAttribution(
          parseInstallReferrer(referrer.referrer, new Date(this.runtime.now()).toISOString()),
        );
      }
    }
  }

  private async captureDirectLink(url: string): Promise<void> {
    if (!this.initialized || this.state.consent !== "granted") return;
    await this.setAttribution(parseDirectLink(url, new Date(this.runtime.now()).toISOString()));
  }

  private async setAttribution(next: AttruviAttribution | null): Promise<void> {
    if (!next || sameAttribution(this.attribution, next) || !this.configuration) return;
    this.attribution = next;
    await this.runtime.storage.setItem(
      `${storageNamespace(this.configuration.appKey)}/attribution`,
      JSON.stringify(next),
    );
    this.emitAttribution();
  }

  private emitAttribution(): void {
    for (const listener of this.attributionListeners) {
      try {
        listener(this.attribution);
      } catch (error) {
        this.runtime.log("warn", "Un listener de atribución lanzó un error", error);
      }
    }
  }

  private async handleAppState(next: AppStateValue): Promise<void> {
    const previous = this.appState;
    this.appState = next;
    if (!this.initialized || this.state.consent !== "granted") return;
    if (next === "background" || next === "inactive") {
      this.state = { ...this.state, lastBackgroundAt: this.runtime.now() };
      await this.persistState();
      return;
    }
    if (next !== "active" || previous === "active") return;
    const now = this.runtime.now();
    const startsNewSession =
      this.state.lastBackgroundAt === null ||
      now - this.state.lastBackgroundAt >= this.configuration!.sessionTimeoutMs;
    if (startsNewSession) this.sessionId = this.runtime.randomUuid();
    await this.track("app_open");
    if (startsNewSession) {
      await this.track("session_start", {}, { idempotencyKey: `session:${this.sessionId}` });
    }
  }

  private async flushInternal(manual: boolean): Promise<FlushResult> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.performFlush(manual).finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  private async performFlush(manual: boolean): Promise<FlushResult> {
    this.cancelFlushTimer();
    if (this.state.consent !== "granted") return { sent: 0, pending: 0 };
    const events = await this.queue!.peek(100, this.runtime.now());
    const pendingBefore = await this.queue!.size();
    if (events.length === 0) return { sent: 0, pending: pendingBefore };

    const identity = await this.runtime.native.getIdentity();
    const batch: AttruviEventBatch = {
      batchId: this.runtime.randomUuid(),
      sentAt: new Date(this.runtime.now()).toISOString(),
      environment: this.configuration!.environment,
      platform: this.runtime.platform,
      sdkVersion: ATTRUVI_SDK_VERSION,
      events,
      ...(identity ? { identity } : {}),
      ...(this.attribution ? { attribution: this.attribution } : {}),
    };
    const controller = new AbortController();
    const timeout = this.runtime.setTimeout(() => controller.abort(), this.configuration!.requestTimeoutMs);
    try {
      const response = await this.runtime.fetch(`${this.configuration!.endpoint}/v1/events/batch`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-attruvi-app-key": this.configuration!.appKey,
          "x-attruvi-sdk": `react-native/${ATTRUVI_SDK_VERSION}`,
        },
        body: JSON.stringify(batch),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`ingest_http_${response.status}`);
      let receivedAt: string | undefined;
      try {
        const body = (await response.json()) as { receivedAt?: unknown };
        if (typeof body.receivedAt === "string") receivedAt = body.receivedAt;
      } catch {
        // Un 2xx sin JSON sigue confirmando el lote completo.
      }
      await this.queue!.acknowledge(events.map((event) => event.eventId));
      const pending = await this.queue!.size();
      if (pending > 0) this.scheduleFlush(0);
      return receivedAt
        ? { sent: events.length, pending, receivedAt }
        : { sent: events.length, pending };
    } catch (error) {
      const delay = await this.queue!.markFailure(this.runtime.now());
      this.runtime.log("warn", "No se pudo enviar el lote; se conservará para reintentar", {
        delay,
        error: error instanceof Error ? error.message : "unknown",
      });
      if (!manual) this.scheduleFlush(delay);
      return { sent: 0, pending: await this.queue!.size() };
    } finally {
      this.runtime.clearTimeout(timeout);
    }
  }

  private scheduleFlush(delay: number): void {
    if (this.flushTimer || this.state.consent !== "granted") return;
    this.flushTimer = this.runtime.setTimeout(() => {
      this.flushTimer = null;
      void this.flushInternal(false);
    }, delay);
  }

  private cancelFlushTimer(): void {
    if (!this.flushTimer) return;
    this.runtime.clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }
}
