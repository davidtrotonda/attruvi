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

type MetaResponse = { events_received?: number; fbtrace_id?: string; messages?: string[]; error?: { code?: number; error_subcode?: number; message?: string; type?: string } };

function payload(config: PostbackDestinationConfig, event: PostbackEvent, test: boolean) {
  requirePostbackConsent(event);
  if (!event.click.fbclid) throw new PostbackDeliveryError("field_rejected", "Meta requires a permitted click signal for this server event.", { providerCode: "missing_fbclid" });
  const timestamp = Math.floor(new Date(event.eventTime).valueOf() / 1000);
  const clickTimestamp = Math.floor(new Date(event.clickOccurredAt ?? event.eventTime).valueOf() / 1000);
  if (!Number.isFinite(timestamp)) throw new PostbackDeliveryError("field_rejected", "The event timestamp is invalid.", { providerCode: "invalid_event_time" });
  if (!Number.isFinite(clickTimestamp)) throw new PostbackDeliveryError("field_rejected", "The click timestamp is invalid.", { providerCode: "invalid_click_time" });
  return {
    data: [{
      action_source: "app",
      event_id: event.providerEventId,
      event_name: config.providerEventName,
      event_time: timestamp,
      user_data: { fbc: `fb.1.${clickTimestamp}.${event.click.fbclid}` },
      ...(event.currency && event.valueMinor !== undefined ? { custom_data: { currency: event.currency, value: moneyValue(event.valueMinor) } } : {}),
    }],
    ...(test && config.testEventCode ? { test_event_code: config.testEventCode } : {}),
  };
}

export class MetaPostbackAdapter implements PostbackAdapter {
  readonly apiVersion = "v26.0";
  readonly provider = "meta_ads" as const;
  constructor(private readonly fetcher: FetchLike = fetch) {}

  private async send(config: PostbackDestinationConfig, event: PostbackEvent, test: boolean): Promise<MetaResponse & { httpStatus: number }> {
    if (test && !config.testEventCode) throw new PostbackDeliveryError("configuration", "Meta Test Events Code is required for a non-production test.", { providerCode: "missing_test_event_code" });
    const { body, response } = await postJson(this.fetcher, `https://graph.facebook.com/${config.apiVersion}/${encodeURIComponent(config.externalConversionId)}/events`, {
      body: JSON.stringify(payload(config, event, test)),
      headers: { accept: "application/json", authorization: `Bearer ${config.credentials.accessToken}`, "content-type": "application/json" },
      method: "POST",
    });
    const parsed = (body ?? {}) as MetaResponse;
    const excerpt = safeExcerpt(parsed.error
      ? { code: parsed.error.code, subcode: parsed.error.error_subcode, type: parsed.error.type }
      : { events_received: parsed.events_received });
    if (response.status === 401 || response.status === 403 || parsed.error?.code === 190) throw new PostbackDeliveryError("token_expired", "Meta rejected the access token.", { httpStatus: response.status, providerCode: String(parsed.error?.code ?? response.status), responseExcerpt: excerpt });
    if (response.status === 429 || parsed.error?.code === 4 || parsed.error?.code === 17 || parsed.error?.code === 32) throw new PostbackDeliveryError("rate_limited", "Meta rate limit reached.", { httpStatus: response.status, providerCode: String(parsed.error?.code ?? response.status), responseExcerpt: excerpt, retryAfterSeconds: retryAfter(response), retryable: true });
    if (response.status >= 500) throw new PostbackDeliveryError("remote_error", "Meta is temporarily unavailable.", { httpStatus: response.status, responseExcerpt: excerpt, retryable: true });
    if (!response.ok || parsed.error) throw new PostbackDeliveryError("field_rejected", "Meta rejected the server event.", { httpStatus: response.status, providerCode: String(parsed.error?.code ?? response.status), responseExcerpt: excerpt });
    return { ...parsed, httpStatus: response.status };
  }

  async deliver(config: PostbackDestinationConfig, event: PostbackEvent): Promise<PostbackDeliveryResult> {
    const response = await this.send(config, event, false);
    return { httpStatus: response.httpStatus, providerRequestId: response.fbtrace_id, responseExcerpt: safeExcerpt({ events_received: response.events_received ?? 0 }), status: "succeeded" };
  }

  async testConfiguration(config: PostbackDestinationConfig, event: PostbackEvent): Promise<PostbackTestResult> {
    await this.send(config, event, true);
    return { message: "Meta recibió el evento en Test Events; no se usará para optimizar campañas.", mode: "provider_test", ok: true };
  }
}
