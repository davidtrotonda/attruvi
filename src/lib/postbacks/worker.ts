import "server-only";

import {
  ConnectorError,
  PostbackDeliveryError,
  type PostbackDestinationConfig,
  type PostbackEvent,
  type PostbackProvider,
} from "@attruvi/connectors";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getFreshConnectorCredentials } from "@/lib/connectors/credentials";
import { isRemoteConnectorProvider, providerEnvironment } from "@/lib/connectors/catalog";
import { createPostbackAdapter } from "./runtime";
import { postbackRetryDelaySeconds } from "./retry";

type Job = {
  app_id: string;
  attempt_count: number;
  destination_id: string;
  event_id: string;
  id: string;
  max_attempts: number;
  organization_id: string;
  provider_event_id: string;
};

type Destination = {
  api_version: string;
  connector_account_id: string | null;
  currency_mode: "app" | "event" | "fixed";
  external_conversion_id: string | null;
  fixed_currency: string | null;
  fixed_value_minor: number | string | null;
  provider: PostbackProvider;
  provider_event_name: string;
  status: string;
  value_mode: "event" | "fixed" | "none";
};

type EventRow = {
  attribution_id: string | null;
  currency: string | null;
  installation_id: string;
  name: string;
  occurred_at: string;
  properties: Record<string, unknown>;
  value_minor: number | string | null;
};

type DeliveryContext = {
  config: PostbackDestinationConfig;
  event: PostbackEvent;
  provider: PostbackProvider;
};

const limits: Record<PostbackProvider, number> = { google_ads: 5, meta_ads: 10, tiktok_ads: 5 };
const skipCodes = new Set(["consent_not_granted", "missing_google_click_id", "missing_fbclid", "missing_ttclid", "no_deterministic_click"]);

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function buildDelivery(job: Job): Promise<DeliveryContext> {
  const service = createSupabaseServiceClient();
  const [{ data: destinationData, error: destinationError }, { data: eventData, error: eventError }, { data: appData, error: appError }] = await Promise.all([
    service.from("postback_destinations").select("provider,connector_account_id,external_conversion_id,status,value_mode,currency_mode,fixed_value_minor,fixed_currency,api_version,provider_event_name").eq("id", job.destination_id).single(),
    service.from("events").select("installation_id,attribution_id,name,occurred_at,properties,value_minor,currency").eq("id", job.event_id).single(),
    service.from("apps").select("currency").eq("id", job.app_id).single(),
  ]);
  if (destinationError || !destinationData) throw new PostbackDeliveryError("configuration", "The postback destination is unavailable.", { providerCode: "destination_unavailable" });
  if (eventError || !eventData) throw new PostbackDeliveryError("configuration", "The source event is unavailable.", { providerCode: "event_unavailable" });
  if (appError || !appData) throw new PostbackDeliveryError("configuration", "The application is unavailable.", { providerCode: "app_unavailable" });
  const destination = destinationData as Destination;
  const eventRow = eventData as EventRow;
  if (destination.status !== "active") throw new PostbackDeliveryError("field_rejected", "The destination is paused.", { providerCode: "destination_paused" });
  if (!destination.connector_account_id || !destination.external_conversion_id) throw new PostbackDeliveryError("configuration", "The destination is pending credentials.", { providerCode: "credentials_pending" });
  if (!isRemoteConnectorProvider(destination.provider)) throw new PostbackDeliveryError("configuration", "Unsupported postback provider.", { providerCode: "provider_unsupported" });

  const [{ data: installation, error: installationError }, { data: account, error: accountError }] = await Promise.all([
    service.from("installations").select("consent_state").eq("id", eventRow.installation_id).single(),
    service.from("connector_accounts").select("id,provider,external_account_id,login_customer_id,connection_state").eq("id", destination.connector_account_id).single(),
  ]);
  if (installationError || !installation) throw new PostbackDeliveryError("configuration", "The installation is unavailable.", { providerCode: "installation_unavailable" });
  if (accountError || !account || account.provider !== destination.provider || !account.external_account_id) throw new PostbackDeliveryError("configuration", "The advertising account is pending credentials.", { providerCode: "credentials_pending" });

  let click: { fbclid?: string; gbraid?: string; gclid?: string; ttclid?: string; wbraid?: string } = {};
  let clickOccurredAt: string | undefined;
  if (eventRow.attribution_id) {
    const { data: attribution } = await service.from("attributions").select("click_id").eq("id", eventRow.attribution_id).maybeSingle();
    if (attribution?.click_id) {
      const { data: clickRow } = await service.from("link_clicks").select("gclid,gbraid,wbraid,fbclid,ttclid,clicked_at").eq("id", attribution.click_id).maybeSingle();
      if (clickRow) click = {
        ...(optionalString(clickRow.fbclid) ? { fbclid: clickRow.fbclid as string } : {}),
        ...(optionalString(clickRow.gbraid) ? { gbraid: clickRow.gbraid as string } : {}),
        ...(optionalString(clickRow.gclid) ? { gclid: clickRow.gclid as string } : {}),
        ...(optionalString(clickRow.ttclid) ? { ttclid: clickRow.ttclid as string } : {}),
        ...(optionalString(clickRow.wbraid) ? { wbraid: clickRow.wbraid as string } : {}),
      };
      clickOccurredAt = optionalString(clickRow?.clicked_at);
    }
  }
  if (Object.keys(click).length === 0) throw new PostbackDeliveryError("field_rejected", "No permitted deterministic click signal is available.", { providerCode: "no_deterministic_click" });

  const credentials = await getFreshConnectorCredentials(destination.provider, account.id);
  const environment = providerEnvironment(destination.provider);
  const rawValue = destination.value_mode === "none"
    ? undefined
    : destination.value_mode === "fixed"
      ? destination.fixed_value_minor
      : eventRow.value_minor;
  const valueMinor = rawValue === null || rawValue === undefined ? undefined : BigInt(rawValue);
  const currency = valueMinor === undefined
    ? undefined
    : destination.currency_mode === "fixed"
      ? destination.fixed_currency ?? undefined
      : destination.currency_mode === "app"
        ? appData.currency
        : eventRow.currency ?? undefined;
  const orderId = optionalString(eventRow.properties.transaction_id)
    ?? optionalString(eventRow.properties.transactionId)
    ?? optionalString(eventRow.properties.order_id)
    ?? optionalString(eventRow.properties.orderId);

  return {
    config: {
      accountExternalId: account.external_account_id,
      apiVersion: destination.api_version,
      credentials,
      ...(environment.developerToken ? { developerToken: environment.developerToken } : {}),
      externalConversionId: destination.external_conversion_id,
      ...(account.login_customer_id ? { loginCustomerId: account.login_customer_id } : {}),
      providerEventName: destination.provider_event_name,
    },
    event: {
      click,
      ...(clickOccurredAt ? { clickOccurredAt } : {}),
      consent: installation.consent_state,
      ...(currency ? { currency } : {}),
      eventName: eventRow.name,
      eventTime: eventRow.occurred_at,
      ...(orderId ? { orderId } : {}),
      providerEventId: job.provider_event_id,
      ...(valueMinor !== undefined ? { valueMinor } : {}),
    },
    provider: destination.provider,
  };
}

async function complete(job: Job, workerId: string, values: Record<string, unknown>) {
  const service = createSupabaseServiceClient();
  const { error } = await service.rpc("complete_postback_job", {
    requested_duration_ms: null,
    requested_http_status: null,
    requested_job_id: job.id,
    requested_next_attempt_at: null,
    requested_provider_error_code: null,
    requested_provider_request_id: null,
    requested_request_metadata: {},
    requested_response_excerpt: null,
    requested_retry_after_seconds: null,
    requested_skip_reason: null,
    requested_worker_id: workerId,
    ...values,
  });
  if (error) throw new Error(`postback_completion_failed:${error.code ?? "unknown"}`);
}

async function updateReconnectRequired(job: Job) {
  const service = createSupabaseServiceClient();
  const { data: destination } = await service.from("postback_destinations").select("connector_account_id").eq("id", job.destination_id).maybeSingle();
  if (destination?.connector_account_id) {
    await service.from("connector_accounts").update({ connection_state: "reconnect_required", last_error_at: new Date().toISOString(), last_error_code: "token_expired" }).eq("id", destination.connector_account_id);
  }
}

async function processJob(job: Job, workerId: string) {
  const started = Date.now();
  let provider: PostbackProvider | undefined;
  try {
    const delivery = await buildDelivery(job);
    provider = delivery.provider;
    const result = await createPostbackAdapter(delivery.provider).deliver(delivery.config, delivery.event);
    await complete(job, workerId, {
      requested_duration_ms: Date.now() - started,
      requested_http_status: result.httpStatus,
      requested_provider_request_id: result.providerRequestId ?? null,
      requested_request_metadata: { apiVersion: delivery.config.apiVersion, eventName: delivery.event.eventName, provider: delivery.provider },
      requested_response_excerpt: result.responseExcerpt ?? null,
      requested_status: "succeeded",
    });
    return "succeeded" as const;
  } catch (caught) {
    const deliveryError = caught instanceof PostbackDeliveryError ? caught : null;
    const connectorError = caught instanceof ConnectorError ? caught : null;
    const code = deliveryError?.providerCode ?? deliveryError?.code ?? connectorError?.code ?? "unexpected_error";
    const retryable = Boolean(deliveryError?.retryable ?? connectorError?.retryable) && job.attempt_count < job.max_attempts;
    const skipped = Boolean(deliveryError && (skipCodes.has(code) || code === "destination_paused"));
    const status = skipped ? "skipped" : retryable ? "retryable_failed" : "permanently_failed";
    const retryAfter = deliveryError?.retryAfterSeconds ?? connectorError?.retryAfterSeconds;
    const delay = retryable ? postbackRetryDelaySeconds(job.attempt_count, retryAfter) : undefined;
    if ((deliveryError?.code ?? connectorError?.code) === "token_expired") await updateReconnectRequired(job);
    await complete(job, workerId, {
      requested_duration_ms: Date.now() - started,
      requested_http_status: deliveryError?.httpStatus ?? null,
      requested_next_attempt_at: delay ? new Date(Date.now() + delay * 1000).toISOString() : null,
      requested_provider_error_code: String(code).slice(0, 120),
      requested_request_metadata: { ...(provider ? { provider } : {}), safe: true },
      requested_response_excerpt: deliveryError?.responseExcerpt ?? null,
      requested_retry_after_seconds: retryAfter ?? null,
      requested_skip_reason: skipped ? String(code).slice(0, 160) : null,
      requested_status: status,
    });
    return status;
  }
}

async function processWithLimit(jobs: Job[], workerId: string, limit: number) {
  const results: string[] = [];
  for (let index = 0; index < jobs.length; index += limit) {
    results.push(...await Promise.all(jobs.slice(index, index + limit).map((job) => processJob(job, workerId))));
  }
  return results;
}

export async function runPostbackBatch(batchSize = 25) {
  const service = createSupabaseServiceClient();
  const workerId = `postbacks-${crypto.randomUUID()}`;
  const { data, error } = await service.rpc("claim_postback_jobs", { batch_size: batchSize, worker_id: workerId });
  if (error) throw new Error("No se han podido reclamar los postbacks pendientes.");
  const jobs = (data ?? []) as Job[];
  const grouped = new Map<PostbackProvider | "unknown", Job[]>();
  if (jobs.length) {
    const destinationIds = [...new Set(jobs.map((job) => job.destination_id))];
    const { data: destinations } = await service.from("postback_destinations").select("id,provider").in("id", destinationIds);
    const providerByDestination = new Map((destinations ?? []).map((row) => [row.id, row.provider as PostbackProvider]));
    for (const job of jobs) {
      const provider = providerByDestination.get(job.destination_id) ?? "unknown";
      grouped.set(provider, [...(grouped.get(provider) ?? []), job]);
    }
  }
  const resultGroups = await Promise.all([...grouped.entries()].map(([provider, providerJobs]) => processWithLimit(providerJobs, workerId, provider === "unknown" ? 1 : limits[provider])));
  const results = resultGroups.flat();
  return {
    claimed: jobs.length,
    permanentlyFailed: results.filter((result) => result === "permanently_failed").length,
    retryableFailed: results.filter((result) => result === "retryable_failed").length,
    skipped: results.filter((result) => result === "skipped").length,
    succeeded: results.filter((result) => result === "succeeded").length,
  };
}
