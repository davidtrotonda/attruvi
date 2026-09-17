import { z } from "zod";

import {
  appKeyConfigurationSchema,
  persistenceResultSchema,
  type AppKeyConfiguration,
  type PersistenceResult,
  type QueuedIngestMessage,
} from "./contracts";
import type { AttributionView } from "./router";

const attributionViewSchema = z
  .object({
    method: z.string().min(1).max(64),
    matchType: z.string().min(1).max(64),
    scope: z.literal("acquisition"),
    confidence: z.number().min(0).max(1),
    deterministic: z.boolean(),
    attributedAt: z.iso.datetime({ offset: true }),
    ruleVersion: z.string().min(1).max(64),
    source: z.string().max(255).optional(),
    campaign: z.string().max(255).optional(),
    adGroup: z.string().max(255).optional(),
    ad: z.string().max(255).optional(),
  })
  .strict();

export class SupabasePersistenceError extends Error {
  constructor(
    readonly status: number,
    readonly transient: boolean,
  ) {
    super(`supabase_persistence_${status}`);
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function serviceHeaders(env: Env): HeadersInit {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
  };
}

function transientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function configuredCacheTtl(env: Env): number {
  const parsed = Number(env.APP_CONFIG_CACHE_TTL_SECONDS);
  return Number.isInteger(parsed) && parsed >= 5 && parsed <= 300 ? parsed : 60;
}

async function callRpc(env: Env, functionName: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: serviceHeaders(env),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new SupabasePersistenceError(response.status, transientStatus(response.status));
  return response.json<unknown>();
}

export async function resolveAppKeyFromSupabase(
  env: Env,
  appKey: string,
): Promise<AppKeyConfiguration | null> {
  const keyHash = await sha256Hex(appKey);
  const cacheKey = `app-key:v1:${keyHash}`;
  const cached = await env.APP_CONFIG_CACHE.get(cacheKey);
  if (cached === "missing") return null;
  if (cached) {
    const parsed = appKeyConfigurationSchema.safeParse(JSON.parse(cached) as unknown);
    if (parsed.success) return parsed.data;
    await env.APP_CONFIG_CACHE.delete(cacheKey);
  }

  const value = await callRpc(env, "resolve_ingest_app_key", { provided_key_hash: keyHash });
  if (value === null) {
    await env.APP_CONFIG_CACHE.put(cacheKey, "missing", { expirationTtl: 15 });
    return null;
  }
  const parsed = appKeyConfigurationSchema.safeParse(value);
  if (!parsed.success) throw new Error("invalid_app_key_configuration_contract");
  await env.APP_CONFIG_CACHE.put(cacheKey, JSON.stringify(parsed.data), {
    expirationTtl: Math.min(parsed.data.cacheTtlSeconds, configuredCacheTtl(env)),
  });
  return parsed.data;
}

export async function readAttributionFromSupabase(
  env: Env,
  appId: string,
  installationId: string,
  installationTokenHash: string,
): Promise<AttributionView | null> {
  const value = await callRpc(env, "read_sdk_attribution", {
    requested_app_id: appId,
    requested_installation_id: installationId,
    provided_token_hash: installationTokenHash,
  });
  if (value === null) return null;
  const parsed = attributionViewSchema.safeParse(value);
  if (!parsed.success) throw new Error("invalid_attribution_contract");
  return parsed.data;
}

export async function persistIngestMessages(
  env: Env,
  messages: readonly QueuedIngestMessage[],
): Promise<PersistenceResult> {
  const value = await callRpc(env, "ingest_sdk_messages_v2", { payload: { messages } });
  const parsed = persistenceResultSchema.safeParse(value);
  if (!parsed.success) throw new SupabasePersistenceError(422, false);
  return parsed.data;
}
