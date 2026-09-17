import type { FetchLike } from "./http.js";
import {
  PostbackDeliveryError,
  moneyValue,
  postJson,
  requirePostbackConsent,
  retryAfter,
  safeExcerpt,
  type PostbackAdapter,
  type PostbackDeliveryResult,
  type PostbackDestinationConfig,
  type PostbackEvent,
  type PostbackTestResult,
} from "./postback-types.js";

type GoogleResponse = {
  jobId?: string;
  partialFailureError?: { code?: number; details?: unknown; message?: string; status?: string };
  results?: Array<{ gbraid?: string; gclid?: string; wbraid?: string }>;
};

function conversionDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new PostbackDeliveryError("field_rejected", "The event timestamp is invalid.", { providerCode: "invalid_event_time" });
  return date.toISOString().replace("T", " ").replace("Z", "+00:00");
}

function clickIdentifier(event: PostbackEvent) {
  if (event.click.gclid) return { gclid: event.click.gclid };
  if (event.click.gbraid) return { gbraid: event.click.gbraid };
  if (event.click.wbraid) return { wbraid: event.click.wbraid };
  throw new PostbackDeliveryError("field_rejected", "Google requires gclid, gbraid or wbraid for this conversion.", { providerCode: "missing_google_click_id" });
}

function body(config: PostbackDestinationConfig, event: PostbackEvent, validateOnly: boolean) {
  requirePostbackConsent(event);
  return {
    conversions: [{
      ...clickIdentifier(event),
      consent: { adUserData: "GRANTED" },
      conversionAction: `customers/${config.accountExternalId}/conversionActions/${config.externalConversionId}`,
      conversionDateTime: conversionDateTime(event.eventTime),
      ...(event.currency && event.valueMinor !== undefined ? { conversionValue: moneyValue(event.valueMinor), currencyCode: event.currency } : {}),
      ...(event.orderId ? { orderId: event.orderId } : {}),
    }],
    partialFailure: true,
    validateOnly,
  };
}

export class GoogleAdsPostbackAdapter implements PostbackAdapter {
  readonly apiVersion = "v25";
  readonly provider = "google_ads" as const;
  constructor(private readonly fetcher: FetchLike = fetch) {}

  private async send(config: PostbackDestinationConfig, event: PostbackEvent, validateOnly: boolean): Promise<GoogleResponse & { httpStatus: number }> {
    if (!config.developerToken) throw new PostbackDeliveryError("configuration", "Google Ads Developer Token is missing.", { providerCode: "missing_developer_token" });
    const { body: responseBody, response } = await postJson(
      this.fetcher,
      `https://googleads.googleapis.com/${config.apiVersion}/customers/${encodeURIComponent(config.accountExternalId)}:uploadClickConversions`,
      {
        body: JSON.stringify(body(config, event, validateOnly)),
        headers: {
          accept: "application/json",
          authorization: `Bearer ${config.credentials.accessToken}`,
          "content-type": "application/json",
          "developer-token": config.developerToken,
          ...(config.loginCustomerId ? { "login-customer-id": config.loginCustomerId } : {}),
        },
        method: "POST",
      },
    );
    const parsed = (responseBody ?? {}) as GoogleResponse & { error?: { code?: number; message?: string; status?: string } };
    const excerpt = safeExcerpt(parsed.partialFailureError
      ? { code: parsed.partialFailureError.code, partialFailure: true, status: parsed.partialFailureError.status }
      : parsed.error
        ? { code: parsed.error.code, status: parsed.error.status }
        : { accepted: parsed.results?.length ?? 0 });
    if (response.status === 401 || response.status === 403) throw new PostbackDeliveryError("token_expired", "Google Ads rejected the access token.", { httpStatus: response.status, providerCode: parsed.error?.status, responseExcerpt: excerpt });
    if (response.status === 429) throw new PostbackDeliveryError("rate_limited", "Google Ads rate limit reached.", { httpStatus: response.status, providerCode: parsed.error?.status, responseExcerpt: excerpt, retryAfterSeconds: retryAfter(response), retryable: true });
    if (response.status >= 500) throw new PostbackDeliveryError("remote_error", "Google Ads is temporarily unavailable.", { httpStatus: response.status, responseExcerpt: excerpt, retryable: true });
    if (!response.ok) throw new PostbackDeliveryError("field_rejected", "Google Ads rejected the conversion fields.", { httpStatus: response.status, providerCode: parsed.error?.status, responseExcerpt: excerpt });
    if (parsed.partialFailureError?.message && !JSON.stringify(parsed.partialFailureError).includes("CLICK_CONVERSION_ALREADY_EXISTS")) {
      throw new PostbackDeliveryError("field_rejected", "Google Ads rejected the conversion fields.", { httpStatus: response.status, providerCode: parsed.partialFailureError.status, responseExcerpt: excerpt });
    }
    return { ...parsed, httpStatus: response.status };
  }

  async deliver(config: PostbackDestinationConfig, event: PostbackEvent): Promise<PostbackDeliveryResult> {
    const response = await this.send(config, event, false);
    return { httpStatus: response.httpStatus, providerRequestId: response.jobId, responseExcerpt: safeExcerpt({ accepted: response.results?.length ?? 1 }), status: "succeeded" };
  }

  async testConfiguration(config: PostbackDestinationConfig, event: PostbackEvent): Promise<PostbackTestResult> {
    await this.send(config, event, true);
    return { message: "Google validó la configuración sin guardar una conversión.", mode: "provider_test", ok: true };
  }
}
