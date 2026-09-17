import type { FetchLike } from "./http.js";
import type { ConnectorCredentials } from "./types.js";

export type PostbackProvider = "google_ads" | "meta_ads" | "tiktok_ads";
export type PostbackConsent = "denied" | "granted" | "limited" | "unknown";

export interface PostbackClickIdentifiers {
  readonly fbclid?: string;
  readonly gbraid?: string;
  readonly gclid?: string;
  readonly ttclid?: string;
  readonly wbraid?: string;
}

export interface PostbackEvent {
  readonly click: PostbackClickIdentifiers;
  readonly clickOccurredAt?: string;
  readonly consent: PostbackConsent;
  readonly currency?: string;
  readonly eventName: string;
  readonly eventTime: string;
  readonly orderId?: string;
  readonly providerEventId: string;
  readonly valueMinor?: bigint;
}

export interface PostbackDestinationConfig {
  readonly accountExternalId: string;
  readonly apiVersion: string;
  readonly credentials: ConnectorCredentials;
  readonly developerToken?: string;
  readonly externalConversionId: string;
  readonly loginCustomerId?: string;
  readonly providerEventName: string;
  readonly testEventCode?: string;
}

export type PostbackDeliveryResult = {
  readonly httpStatus: number;
  readonly providerRequestId?: string | undefined;
  readonly responseExcerpt?: string | undefined;
  readonly status: "succeeded";
};

export type PostbackTestResult = {
  readonly message: string;
  readonly mode: "local_validation" | "provider_test";
  readonly ok: boolean;
};

export interface PostbackAdapter {
  readonly apiVersion: string;
  readonly provider: PostbackProvider;
  deliver(config: PostbackDestinationConfig, event: PostbackEvent): Promise<PostbackDeliveryResult>;
  testConfiguration(config: PostbackDestinationConfig, event: PostbackEvent): Promise<PostbackTestResult>;
}

export type PostbackErrorCode =
  | "configuration"
  | "duplicate"
  | "field_rejected"
  | "invalid_response"
  | "network_error"
  | "rate_limited"
  | "remote_error"
  | "token_expired";

export class PostbackDeliveryError extends Error {
  readonly code: PostbackErrorCode;
  readonly httpStatus: number | undefined;
  readonly providerCode: string | undefined;
  readonly responseExcerpt: string | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly retryable: boolean;

  constructor(
    code: PostbackErrorCode,
    message: string,
    options: {
      httpStatus?: number | undefined;
      providerCode?: string | undefined;
      responseExcerpt?: string | undefined;
      retryable?: boolean | undefined;
      retryAfterSeconds?: number | undefined;
    } = {},
  ) {
    super(message);
    this.name = "PostbackDeliveryError";
    this.code = code;
    this.httpStatus = options.httpStatus;
    this.providerCode = options.providerCode;
    this.responseExcerpt = options.responseExcerpt;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.retryable = options.retryable ?? false;
  }
}

export function requirePostbackConsent(event: PostbackEvent) {
  if (event.consent !== "granted") {
    throw new PostbackDeliveryError("field_rejected", "The event is not eligible because advertising consent is not granted.", {
      providerCode: "consent_not_granted",
    });
  }
}

export function moneyValue(valueMinor: bigint | undefined) {
  return valueMinor === undefined ? undefined : Number(valueMinor) / 100;
}

export function safeExcerpt(value: unknown, maximum = 400) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return raw
    .replace(/(access[_-]?token|authorization|developer-token|client_secret)\s*["'=:\s]+[^",}\s]+/gi, "$1:[REDACTED]")
    .slice(0, maximum);
}

export function retryAfter(response: Response) {
  const parsed = Number(response.headers.get("retry-after") ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function postJson(
  fetcher: FetchLike,
  url: string,
  init: RequestInit,
): Promise<{ body: unknown; response: Response }> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch {
    throw new PostbackDeliveryError("network_error", "The advertising network could not be reached.", { retryable: true });
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    if (response.ok) throw new PostbackDeliveryError("invalid_response", "The advertising network returned invalid JSON.", { httpStatus: response.status });
  }
  return { body, response };
}
