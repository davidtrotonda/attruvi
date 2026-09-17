import {
  sdkAttributionQuerySchema,
  sdkEventBatchSchema,
  sdkIdentifySchema,
  sdkInstallationSchema,
  type SdkEventBatch,
  type SdkIdentify,
  type SdkInstallation,
} from "@attruvi/core";

import type { AppKeyConfiguration, QueuedIngestMessage } from "./contracts";
import { assertSafePayload, readBoundedJson, UnsafePayloadError, validateDeviceTime } from "./security";

export type MetricName = "accepted" | "rejected" | "queued" | "persisted" | "lag";

export interface AttributionView {
  readonly method: string;
  readonly matchType: string;
  readonly scope: "acquisition";
  readonly confidence: number;
  readonly deterministic: boolean;
  readonly attributedAt: string;
  readonly ruleVersion: string;
  readonly source?: string | undefined;
  readonly campaign?: string | undefined;
  readonly adGroup?: string | undefined;
  readonly ad?: string | undefined;
}

export interface IngestRuntime {
  readonly maximumRequestBytes: number;
  now(): Date;
  randomUuid(): string;
  resolveAppKey(appKey: string): Promise<AppKeyConfiguration | null>;
  rateLimit(scope: "app" | "ip" | "abuse", key: string): Promise<boolean>;
  enqueue(message: QueuedIngestMessage): Promise<void>;
  issueInstallationToken(): Promise<{ token: string; hash: string }>;
  hash(value: string): Promise<string>;
  createProbabilisticEvidence(
    ipAddress: string,
    userAgent: string,
  ): Promise<{ networkPrefixHash: string; userAgentHash: string } | null>;
  readAttribution(
    appId: string,
    installationId: string,
    installationTokenHash: string,
  ): Promise<AttributionView | null>;
  verifyAttestation?(
    token: string,
    context: { appId: string; platform: "ios" | "android" },
  ): Promise<boolean>;
  metric(name: MetricName, value: number, dimensions: Record<string, string>): void;
}

function json(body: unknown, status: number, requestId: string, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-request-id": requestId,
      ...headers,
    },
  });
}

function routeKind(pathname: string): "installation" | "events" | "identify" | "attribution" | null {
  if (pathname === "/v1/installations") return "installation";
  if (pathname === "/v1/events/batch") return "events";
  if (pathname === "/v1/identify") return "identify";
  if (pathname === "/v1/attribution") return "attribution";
  return null;
}

function methodFor(kind: NonNullable<ReturnType<typeof routeKind>>): "GET" | "POST" {
  return kind === "attribution" ? "GET" : "POST";
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

function isJson(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.startsWith("application/json") || contentType.includes("+json");
}

function reject(
  runtime: IngestRuntime,
  requestId: string,
  code: string,
  status: number,
  dimensions: Record<string, string> = {},
  headers?: HeadersInit,
): Response {
  runtime.metric("rejected", 1, { code, ...dimensions });
  return json({ code, requestId }, status, requestId, headers);
}

function eventClockError(occurredAt: string, now: Date): string | null {
  const clock = validateDeviceTime(occurredAt, now);
  if (clock === "future") return "event_in_future";
  if (clock === "too_old") return "event_too_old";
  return null;
}

async function attestationStatus(
  request: Request,
  configuration: AppKeyConfiguration,
  platform: "ios" | "android",
  runtime: IngestRuntime,
): Promise<"absent" | "unverified" | "verified" | "required" | "invalid" | "unavailable"> {
  const token = request.headers.get("x-attruvi-attestation")?.trim();
  if (!token) return configuration.attestationMode === "required" ? "required" : "absent";
  if (!runtime.verifyAttestation) {
    return configuration.attestationMode === "required" ? "unavailable" : "unverified";
  }
  return (await runtime.verifyAttestation(token, { appId: configuration.appId, platform }))
    ? "verified"
    : "invalid";
}

export function createIngestHandler(runtime: IngestRuntime) {
  return async (request: Request): Promise<Response> => {
    const requestId = runtime.randomUuid();
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      if (request.method !== "GET") {
        return json({ code: "method_not_allowed", requestId }, 405, requestId, { allow: "GET" });
      }
      return json({ service: "attruvi-ingest", status: "ok", version: "v1", requestId }, 200, requestId);
    }

    const kind = routeKind(url.pathname);
    if (!kind) return reject(runtime, requestId, "not_found", 404);
    const expectedMethod = methodFor(kind);
    if (request.method !== expectedMethod) {
      return reject(runtime, requestId, "method_not_allowed", 405, {}, { allow: expectedMethod });
    }

    const appKey = request.headers.get("x-attruvi-app-key")?.trim() ?? "";
    if (!/^attruvi_[A-Za-z0-9_-]{8,}$/.test(appKey)) {
      const allowed = await runtime.rateLimit("abuse", await runtime.hash(clientIp(request)));
      return reject(runtime, requestId, allowed ? "invalid_app_key" : "rate_limited", allowed ? 401 : 429);
    }

    const hashedIp = await runtime.hash(clientIp(request));
    const ipAllowedBeforeLookup = await runtime.rateLimit("ip", hashedIp);
    if (!ipAllowedBeforeLookup) return reject(runtime, requestId, "rate_limited", 429, {}, { "retry-after": "60" });

    const configuration = await runtime.resolveAppKey(appKey);
    if (!configuration) return reject(runtime, requestId, "invalid_app_key", 401);
    if (configuration.status === "revoked") return reject(runtime, requestId, "app_key_revoked", 403);
    if (configuration.status !== "active" || configuration.appStatus !== "active") {
      return reject(runtime, requestId, "app_key_inactive", 403, { appId: configuration.appId });
    }

    const appAllowed = await runtime.rateLimit("app", configuration.appId);
    if (!appAllowed) {
      return reject(runtime, requestId, "rate_limited", 429, { appId: configuration.appId }, { "retry-after": "60" });
    }

    const logicalOrigin = request.headers.get("x-attruvi-sdk")?.trim() ?? "";
    if (!configuration.allowedSdkPrefixes.some((prefix) => logicalOrigin.startsWith(`${prefix}/`))) {
      return reject(runtime, requestId, "invalid_sdk_origin", 403, { appId: configuration.appId });
    }

    if (kind === "attribution") {
      const parsedQuery = sdkAttributionQuerySchema.safeParse({
        installationId: url.searchParams.get("installation_id"),
      });
      const installationToken = request.headers.get("x-attruvi-installation-token")?.trim() ?? "";
      if (!parsedQuery.success || installationToken.length < 32 || installationToken.length > 512) {
        return reject(runtime, requestId, "invalid_attribution_request", 400, { appId: configuration.appId });
      }
      const attribution = await runtime.readAttribution(
        configuration.appId,
        parsedQuery.data.installationId,
        await runtime.hash(installationToken),
      );
      if (!attribution) return reject(runtime, requestId, "attribution_not_found", 404, { appId: configuration.appId });
      runtime.metric("accepted", 1, { appId: configuration.appId, route: kind });
      return json({ attribution, requestId }, 200, requestId);
    }

    if (!isJson(request)) {
      return reject(runtime, requestId, "unsupported_media_type", 415, { appId: configuration.appId });
    }

    const maximumBytes = Math.min(runtime.maximumRequestBytes, configuration.maxRequestBytes);
    let raw: unknown;
    try {
      raw = await readBoundedJson(request, maximumBytes);
      assertSafePayload(raw);
    } catch (error) {
      if (error instanceof RangeError) return reject(runtime, requestId, "payload_too_large", 413, { appId: configuration.appId });
      if (error instanceof UnsafePayloadError) return reject(runtime, requestId, error.code, 400, { appId: configuration.appId });
      return reject(runtime, requestId, "invalid_json", 400, { appId: configuration.appId });
    }

    let installationBody: SdkInstallation | null = null;
    let eventBody: SdkEventBatch | null = null;
    let identifyBody: SdkIdentify | null = null;
    if (kind === "installation") {
      const parsed = sdkInstallationSchema.safeParse(raw);
      if (!parsed.success) return reject(runtime, requestId, "invalid_installation_payload", 400, { appId: configuration.appId });
      installationBody = parsed.data;
    } else if (kind === "events") {
      const parsed = sdkEventBatchSchema.safeParse(raw);
      if (!parsed.success) return reject(runtime, requestId, "invalid_events_payload", 400, { appId: configuration.appId });
      eventBody = parsed.data;
    } else {
      const parsed = sdkIdentifySchema.safeParse(raw);
      if (!parsed.success) return reject(runtime, requestId, "invalid_identify_payload", 400, { appId: configuration.appId });
      identifyBody = parsed.data;
    }
    const body = installationBody ?? eventBody ?? identifyBody!;
    if (body.environment !== configuration.environment || !configuration.allowedPlatforms.includes(body.platform)) {
      return reject(runtime, requestId, "app_key_scope_mismatch", 403, { appId: configuration.appId });
    }
    if (logicalOrigin !== `react-native/${body.sdkVersion}`) {
      return reject(runtime, requestId, "sdk_version_mismatch", 400, { appId: configuration.appId });
    }
    if (eventBody && eventBody.events.length > configuration.maxBatchEvents) {
      return reject(runtime, requestId, "batch_too_large", 413, { appId: configuration.appId });
    }

    const now = runtime.now();
    const deviceTimes = eventBody
      ? eventBody.events.map((event) => event.occurredAt)
      : [installationBody?.occurredAt ?? identifyBody!.occurredAt];
    const clockError = deviceTimes.map((value) => eventClockError(value, now)).find(Boolean);
    if (clockError) return reject(runtime, requestId, clockError, 422, { appId: configuration.appId });

    const attestation = await attestationStatus(request, configuration, body.platform, runtime);
    if (attestation === "required" || attestation === "invalid") {
      return reject(runtime, requestId, "attestation_required", 401, { appId: configuration.appId });
    }
    if (attestation === "unavailable") {
      return reject(runtime, requestId, "attestation_unavailable", 503, { appId: configuration.appId });
    }

    const receivedAt = now.toISOString();
    const probabilisticEvidence = configuration.probabilisticEnabled
      ? await runtime.createProbabilisticEvidence(
          clientIp(request),
          request.headers.get("user-agent")?.slice(0, 512) ?? "",
        )
      : null;
    const base = {
      version: 1 as const,
      requestId,
      receivedAt,
      keyId: configuration.keyId,
      organizationId: configuration.organizationId,
      appId: configuration.appId,
      environment: configuration.environment,
      logicalOrigin,
      attestation,
      ...(probabilisticEvidence ? { probabilisticEvidence } : {}),
    };

    let message: QueuedIngestMessage;
    let installationToken: string | undefined;
    if (kind === "installation") {
      const issued = await runtime.issueInstallationToken();
      installationToken = issued.token;
      message = { ...base, kind, accessTokenHash: issued.hash, body: installationBody! };
    } else if (kind === "events") {
      message = { ...base, kind, body: eventBody! };
    } else {
      message = { ...base, kind: "identify", body: identifyBody! };
    }

    await runtime.enqueue(message);
    const accepted = eventBody ? eventBody.events.length : 1;
    runtime.metric("accepted", accepted, { appId: configuration.appId, route: kind });
    runtime.metric("queued", accepted, { appId: configuration.appId, route: kind });
    return json(
      {
        status: "queued",
        requestId,
        receivedAt,
        accepted,
        ...(eventBody ? { batchId: eventBody.batchId } : {}),
        ...(installationToken ? { installationToken } : {}),
      },
      202,
      requestId,
    );
  };
}
