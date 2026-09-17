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

type TikTokResponse = { code?: number; data?: { request_id?: string }; message?: string; request_id?: string };

function payload(config: PostbackDestinationConfig, event: PostbackEvent) {
  requirePostbackConsent(event);
  if (!event.click.ttclid) throw new PostbackDeliveryError("field_rejected", "TikTok requires ttclid for this event.", { providerCode: "missing_ttclid" });
  const timestamp = Math.floor(new Date(event.eventTime).valueOf() / 1000);
  if (!Number.isFinite(timestamp)) throw new PostbackDeliveryError("field_rejected", "The event timestamp is invalid.", { providerCode: "invalid_event_time" });
  return {
    data: [{
      event: config.providerEventName,
      event_id: event.providerEventId,
      event_time: timestamp,
      properties: {
        ...(event.currency && event.valueMinor !== undefined ? { currency: event.currency, value: moneyValue(event.valueMinor) } : {}),
        ...(event.orderId ? { order_id: event.orderId } : {}),
      },
      user: { ttclid: event.click.ttclid },
    }],
    event_source: "APP",
    event_source_id: config.externalConversionId,
  };
}

export class TikTokPostbackAdapter implements PostbackAdapter {
  readonly apiVersion = "v1.3";
  readonly provider = "tiktok_ads" as const;
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async deliver(config: PostbackDestinationConfig, event: PostbackEvent): Promise<PostbackDeliveryResult> {
    const { body, response } = await postJson(this.fetcher, `https://business-api.tiktok.com/open_api/${config.apiVersion}/event/track/`, {
      body: JSON.stringify(payload(config, event)),
      headers: { "Access-Token": config.credentials.accessToken, accept: "application/json", "content-type": "application/json" },
      method: "POST",
    });
    const parsed = (body ?? {}) as TikTokResponse;
    const excerpt = safeExcerpt({ code: parsed.code });
    if (response.status === 401 || response.status === 403 || parsed.code === 40100 || parsed.code === 40001) throw new PostbackDeliveryError("token_expired", "TikTok rejected the access token.", { httpStatus: response.status, providerCode: String(parsed.code ?? response.status), responseExcerpt: excerpt });
    if (response.status === 429) throw new PostbackDeliveryError("rate_limited", "TikTok rate limit reached.", { httpStatus: response.status, providerCode: String(parsed.code ?? response.status), responseExcerpt: excerpt, retryAfterSeconds: retryAfter(response), retryable: true });
    if (response.status >= 500) throw new PostbackDeliveryError("remote_error", "TikTok is temporarily unavailable.", { httpStatus: response.status, responseExcerpt: excerpt, retryable: true });
    if (!response.ok || (typeof parsed.code === "number" && parsed.code !== 0)) throw new PostbackDeliveryError("field_rejected", "TikTok rejected the event.", { httpStatus: response.status, providerCode: String(parsed.code ?? response.status), responseExcerpt: excerpt });
    return { httpStatus: response.status, providerRequestId: parsed.request_id ?? parsed.data?.request_id, responseExcerpt: excerpt, status: "succeeded" };
  }

  async testConfiguration(config: PostbackDestinationConfig, event: PostbackEvent): Promise<PostbackTestResult> {
    payload(config, event);
    if (!config.credentials.accessToken || !config.externalConversionId) throw new PostbackDeliveryError("configuration", "TikTok credentials and Event Source ID are required.");
    return { message: "La configuración y el payload son válidos. TikTok no ofrece un modo universal sin entrega; no se envió ningún evento.", mode: "local_validation", ok: true };
  }
}
