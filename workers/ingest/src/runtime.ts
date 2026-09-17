import type { QueuedIngestMessage } from "./contracts";
import type { IngestRuntime, MetricName } from "./router";
import {
  readAttributionFromSupabase,
  resolveAppKeyFromSupabase,
  sha256Hex,
} from "./supabase";

function positiveInteger(value: string, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function writeMetric(
  env: Env,
  name: MetricName,
  value: number,
  dimensions: Record<string, string>,
): void {
  env.INGEST_METRICS.writeDataPoint({
    indexes: [dimensions.appId ?? "global"],
    blobs: [name, dimensions.route ?? "", dimensions.code ?? ""],
    doubles: [value],
  });
}

export function createCloudflareRuntime(env: Env): IngestRuntime {
  return {
    maximumRequestBytes: positiveInteger(env.MAX_REQUEST_BYTES, 262_144, 1_048_576),
    now: () => new Date(),
    randomUuid: () => crypto.randomUUID(),
    resolveAppKey: (appKey) => resolveAppKeyFromSupabase(env, appKey),
    async rateLimit(scope, key) {
      const limiter =
        scope === "app" ? env.APP_RATE_LIMIT : scope === "ip" ? env.IP_RATE_LIMIT : env.ABUSE_RATE_LIMIT;
      return (await limiter.limit({ key })).success;
    },
    async enqueue(message: QueuedIngestMessage) {
      await env.EVENT_QUEUE.send(message, { contentType: "json" });
    },
    async issueInstallationToken() {
      const token = randomToken();
      return { token, hash: await sha256Hex(token) };
    },
    hash: sha256Hex,
    readAttribution: (appId, installationId, tokenHash) =>
      readAttributionFromSupabase(env, appId, installationId, tokenHash),
    metric: (name, value, dimensions) => writeMetric(env, name, value, dimensions),
  };
}
