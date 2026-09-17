export type AttruviEnvironment = "development" | "staging" | "production";
export type ConsentState = "unknown" | "granted" | "denied";
export interface ConsentPurposes {
  readonly analytics: boolean;
  readonly attribution: boolean;
  readonly advertising: boolean;
  readonly personalization: boolean;
}
export type AttruviPlatform = "ios" | "android";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type EventProperties = Readonly<Record<string, unknown>>;

export interface PropertyAllowlist {
  readonly all?: readonly string[];
  readonly events?: Readonly<Record<string, readonly string[]>>;
  readonly traits?: readonly string[];
}

export interface AttruviConfiguration {
  readonly appKey: string;
  readonly endpoint: string;
  readonly environment: AttruviEnvironment;
  readonly consent: ConsentState;
  readonly purposes?: ConsentPurposes;
  readonly propertyAllowlist?: PropertyAllowlist;
  readonly sessionTimeoutMs?: number;
  readonly flushAt?: number;
  readonly flushIntervalMs?: number;
  readonly maxQueueEvents?: number;
  readonly maxQueueBytes?: number;
  readonly requestTimeoutMs?: number;
}

export interface TrackOptions {
  readonly eventId?: string;
  readonly idempotencyKey?: string;
  readonly flush?: boolean;
}

export interface AttruviAttribution {
  readonly method: "direct_link" | "install_referrer";
  readonly capturedAt: string;
  readonly clickId?: string;
  readonly source?: string;
  readonly medium?: string;
  readonly campaign?: string;
  readonly content?: string;
  readonly term?: string;
  readonly campaignId?: string;
  readonly adGroupId?: string;
  readonly adId?: string;
  readonly gclid?: string;
  readonly gbraid?: string;
  readonly wbraid?: string;
  readonly fbclid?: string;
  readonly ttclid?: string;
  readonly deepLinkPath?: string;
}

export interface AttruviIdentity {
  readonly userId: string;
  readonly traits: Readonly<Record<string, JsonValue>>;
}

export interface AttruviEvent {
  readonly eventId: string;
  readonly installationId: string;
  readonly anonymousId: string;
  readonly sessionId: string;
  readonly name: string;
  readonly occurredAt: string;
  readonly idempotencyKey: string;
  readonly properties: Readonly<Record<string, JsonValue>>;
}

export interface AttruviEventBatch {
  readonly batchId: string;
  readonly sentAt: string;
  readonly environment: AttruviEnvironment;
  readonly platform: AttruviPlatform;
  readonly sdkVersion: string;
  readonly consent: "granted";
  readonly purposes: ConsentPurposes;
  readonly identity?: AttruviIdentity;
  readonly attribution?: AttruviAttribution;
  readonly events: readonly AttruviEvent[];
}

export interface FlushResult {
  readonly sent: number;
  readonly pending: number;
  readonly receivedAt?: string;
}

export type AttributionListener = (attribution: AttruviAttribution | null) => void;

export interface AttruviPublicApi {
  initialize(configuration: AttruviConfiguration): Promise<void>;
  track(name: string, properties?: EventProperties, options?: TrackOptions): Promise<string | null>;
  identify(userId: string, traits?: EventProperties): Promise<void>;
  resetIdentity(): Promise<void>;
  setConsent(state: ConsentState, purposes?: ConsentPurposes): Promise<void>;
  getAttribution(): Promise<AttruviAttribution | null>;
  flush(): Promise<FlushResult>;
  onAttributionChanged(listener: AttributionListener): () => void;
}
