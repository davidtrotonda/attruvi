import type { KeyValueStorage } from "./runtime.js";
import type { AttruviEvent } from "./types.js";

interface QueueState {
  readonly version: 1;
  readonly events: readonly AttruviEvent[];
  readonly retryAttempt: number;
  readonly nextAttemptAt: number;
}

export interface QueueOptions {
  readonly maxEvents: number;
  readonly maxBytes: number;
  readonly baseRetryMs?: number;
  readonly maxRetryMs?: number;
  readonly jitter?: () => number;
}

const EMPTY_QUEUE: QueueState = {
  version: 1,
  events: [],
  retryAttempt: 0,
  nextAttemptAt: 0,
};

function parseQueue(value: string | null): QueueState {
  if (!value) return EMPTY_QUEUE;
  try {
    const parsed = JSON.parse(value) as Partial<QueueState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.events)) return EMPTY_QUEUE;
    return {
      version: 1,
      events: parsed.events as AttruviEvent[],
      retryAttempt: Number.isInteger(parsed.retryAttempt) ? Math.max(0, parsed.retryAttempt ?? 0) : 0,
      nextAttemptAt: Number.isFinite(parsed.nextAttemptAt) ? Math.max(0, parsed.nextAttemptAt ?? 0) : 0,
    };
  } catch {
    return EMPTY_QUEUE;
  }
}

export class PersistentEventQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly baseRetryMs: number;
  private readonly maxRetryMs: number;
  private readonly jitter: () => number;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly storageKey: string,
    private readonly options: QueueOptions,
  ) {
    this.baseRetryMs = options.baseRetryMs ?? 1_000;
    this.maxRetryMs = options.maxRetryMs ?? 60_000;
    this.jitter = options.jitter ?? Math.random;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.chain.then(operation, operation);
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async read(): Promise<QueueState> {
    return parseQueue(await this.storage.getItem(this.storageKey));
  }

  private async write(state: QueueState): Promise<void> {
    await this.storage.setItem(this.storageKey, JSON.stringify(state));
  }

  async enqueue(event: AttruviEvent): Promise<{ dropped: number }> {
    return this.serialize(async () => {
      const current = await this.read();
      const events = [...current.events, event];
      let dropped = 0;

      while (
        events.length > this.options.maxEvents ||
        (events.length > 1 && JSON.stringify(events).length > this.options.maxBytes)
      ) {
        events.shift();
        dropped += 1;
      }

      await this.write({ ...current, events });
      return { dropped };
    });
  }

  async peek(limit: number, now: number): Promise<readonly AttruviEvent[]> {
    return this.serialize(async () => {
      const state = await this.read();
      if (state.nextAttemptAt > now) return [];
      return state.events.slice(0, Math.max(1, limit));
    });
  }

  async acknowledge(eventIds: readonly string[]): Promise<void> {
    const acknowledged = new Set(eventIds);
    await this.serialize(async () => {
      const state = await this.read();
      await this.write({
        version: 1,
        events: state.events.filter((event) => !acknowledged.has(event.eventId)),
        retryAttempt: 0,
        nextAttemptAt: 0,
      });
    });
  }

  async markFailure(now: number): Promise<number> {
    return this.serialize(async () => {
      const state = await this.read();
      const retryAttempt = Math.min(state.retryAttempt + 1, 20);
      const exponential = Math.min(this.maxRetryMs, this.baseRetryMs * 2 ** (retryAttempt - 1));
      const delay = Math.round(exponential * (0.5 + this.jitter()));
      await this.write({ ...state, retryAttempt, nextAttemptAt: now + delay });
      return delay;
    });
  }

  async resetBackoff(): Promise<void> {
    await this.serialize(async () => {
      const state = await this.read();
      await this.write({ ...state, retryAttempt: 0, nextAttemptAt: 0 });
    });
  }

  async size(): Promise<number> {
    return this.serialize(async () => (await this.read()).events.length);
  }

  async clear(): Promise<void> {
    await this.serialize(async () => this.storage.removeItem(this.storageKey));
  }
}
