import type {
  AttruviIdentity,
  AttruviPlatform,
  ConsentState,
} from "./types.js";

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SecureIdentifiers {
  readonly installationId: string;
  readonly anonymousId: string;
}

export interface InstallReferrerResult {
  readonly referrer: string;
  readonly clickTimestampSeconds?: number;
  readonly installTimestampSeconds?: number;
}

export interface NativeAttruviModule {
  getOrCreateIdentifiers(): Promise<SecureIdentifiers>;
  resetAnonymousId(): Promise<SecureIdentifiers>;
  getInstallReferrer(): Promise<InstallReferrerResult | null>;
  getInitialLink(): Promise<string | null>;
  getIdentity(): Promise<AttruviIdentity | null>;
  setIdentity(identity: AttruviIdentity): Promise<void>;
  clearIdentity(): Promise<void>;
}

export type AppStateValue = "active" | "background" | "inactive" | "unknown";

export interface Subscription {
  remove(): void;
}

export interface RuntimeAdapter {
  readonly platform: AttruviPlatform;
  readonly storage: KeyValueStorage;
  readonly native: NativeAttruviModule;
  readonly fetch: typeof globalThis.fetch;
  now(): number;
  randomUuid(): string;
  getInitialUrl(): Promise<string | null>;
  onUrl(listener: (url: string) => void | Promise<void>): Subscription;
  getAppState(): AppStateValue;
  onAppStateChanged(listener: (state: AppStateValue) => void | Promise<void>): Subscription;
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
  log(level: "debug" | "warn", message: string, details?: unknown): void;
}

export interface PersistedSdkState {
  readonly version: 1;
  readonly consent: ConsentState;
  readonly installTracked: boolean;
  readonly lastBackgroundAt: number | null;
}

export function createUuid(random = Math.random, now = Date.now()): string {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(random() * 256);
  }
  bytes[0] = (bytes[0]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const clock = now.toString(16).padStart(12, "0").slice(-12);
  for (let index = 0; index < 6; index += 1) {
    bytes[10 + index] = Number.parseInt(clock.slice(index * 2, index * 2 + 2), 16);
  }
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
