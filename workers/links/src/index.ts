import { associationConfig } from "./association-config";
import {
  clickMessageSchema,
  smartLinkConfigSchema,
  type ClickMessage,
  type SmartLinkConfig,
} from "./contracts";
import { createSmartLinkHandler, type LinkRuntime } from "./router";
import { assertLinksEnvironment, secureResponse } from "./environment";
import { supabaseServerAuthHeaders } from "./supabase-auth";

const linkCachePrefix = "smart-link:v1:";
const missingCachePrefix = "smart-link-missing:v1:";
const dedupeCachePrefix = "click-dedupe:v1:";
const adminReplayPrefix = "admin-replay:v1:";

function serviceHeaders(env: Env): HeadersInit {
  return {
    ...supabaseServerAuthHeaders(env.SUPABASE_SERVICE_ROLE_KEY),
    "Content-Type": "application/json",
    "User-Agent": "Attruvi-Links-Worker/0.1.0",
  };
}

function positiveInteger(value: string, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function cacheTtl(env: Env) {
  return positiveInteger(env.SMART_LINK_CACHE_TTL_SECONDS, 300, 3_600);
}

async function fetchSmartLink(env: Env, slug: string): Promise<SmartLinkConfig | null> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/resolve_smart_link`, {
    method: "POST",
    headers: serviceHeaders(env),
    body: JSON.stringify({ requested_slug: slug }),
  });
  if (!response.ok) throw new Error(`smart_link_resolver_${response.status}`);

  const value: unknown = await response.json();
  if (value === null) return null;
  const parsed = smartLinkConfigSchema.safeParse(value);
  if (!parsed.success) throw new Error("invalid_smart_link_contract");
  return parsed.data;
}

function createCloudflareRuntime(env: Env): LinkRuntime {
  return {
    async enqueueClick(message) {
      await env.CLICK_QUEUE.send(message, { contentType: "json" });
    },
    async hash(value) {
      const bytes = new TextEncoder().encode(`${env.CLICK_HASH_SALT}|${value}`);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    },
    async isDuplicate(dedupeKey) {
      const key = `${dedupeCachePrefix}${dedupeKey}`;
      if (await env.LINKS_KV.get(key)) return true;
      await env.LINKS_KV.put(key, "1", { expirationTtl: 60 });
      return false;
    },
    async releaseDuplicate(dedupeKey) {
      await env.LINKS_KV.delete(`${dedupeCachePrefix}${dedupeKey}`);
    },
    now: () => new Date(),
    async resolveLink(slug) {
      const key = `${linkCachePrefix}${slug}`;
      const cached = await env.LINKS_KV.get(key, "json");
      const parsed = smartLinkConfigSchema.safeParse(cached);
      if (parsed.success) return parsed.data;
      if (await env.LINKS_KV.get(`${missingCachePrefix}${slug}`)) return null;

      const resolved = await fetchSmartLink(env, slug);
      if (!resolved) {
        await env.LINKS_KV.put(`${missingCachePrefix}${slug}`, "1", {
          expirationTtl: 60,
        });
        return null;
      }

      await env.LINKS_KV.put(key, JSON.stringify(resolved), {
        expirationTtl: cacheTtl(env),
      });
      return resolved;
    },
  };
}

function associationResponse(pathname: string) {
  if (
    pathname === "/apple-app-site-association" ||
    pathname === "/.well-known/apple-app-site-association"
  ) {
    return Response.json(
      {
        applinks: {
          apps: [],
          details: associationConfig.apple.map((entry) => ({
            appIDs: entry.appIDs,
            components: entry.components,
          })),
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300",
          "Content-Type": "application/json",
        },
      },
    );
  }

  if (pathname === "/.well-known/assetlinks.json") {
    return Response.json(
      associationConfig.android.map((entry) => ({
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: entry.packageName,
          sha256_cert_fingerprints: entry.sha256CertFingerprints,
        },
      })),
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  }
  return null;
}

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return difference === 0;
}

async function readBoundedJson(request: Request, maximumBytes: number) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maximumBytes) {
      await reader.cancel();
      throw new RangeError("request_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

async function expectedAdminSignature(token: string, timestamp: string, nonce: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${nonce}.${body}`),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function handleCachePurge(request: Request, env: Env) {
  if (request.method !== "POST") {
    return Response.json({ code: "method_not_allowed" }, { status: 405 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || !(await secureEqual(token, env.LINKS_SYNC_TOKEN))) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  const timestamp = request.headers.get("x-attruvi-timestamp") ?? "";
  const nonce = request.headers.get("x-attruvi-nonce") ?? "";
  const signature = request.headers.get("x-attruvi-signature") ?? "";
  const timestampValue = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampValue) ||
    Math.abs(Date.now() - timestampValue) > 5 * 60_000 ||
    !/^[0-9a-f-]{36}$/i.test(nonce) ||
    !/^[0-9a-f]{64}$/i.test(signature)
  ) {
    return Response.json({ code: "invalid_request_signature" }, { status: 401 });
  }
  const replayKey = `${adminReplayPrefix}${nonce}`;
  if (await env.LINKS_KV.get(replayKey)) {
    return Response.json({ code: "replayed_request" }, { status: 409 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 4_096) {
    return Response.json({ code: "request_too_large" }, { status: 413 });
  }
  let payload: unknown;
  const verificationRequest = request.clone();
  try {
    payload = await readBoundedJson(request, 4_096);
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ code: "request_too_large" }, { status: 413 });
    }
    throw error;
  }
  const rawBody = await verificationRequest.text();
  const expectedSignature = await expectedAdminSignature(env.LINKS_SYNC_TOKEN, timestamp, nonce, rawBody);
  if (!(await secureEqual(signature, expectedSignature))) {
    return Response.json({ code: "invalid_request_signature" }, { status: 401 });
  }
  await env.LINKS_KV.put(replayKey, "1", { expirationTtl: 600 });
  const slugs =
    payload && typeof payload === "object" && "slugs" in payload && Array.isArray(payload.slugs)
      ? payload.slugs
          .filter(
            (slug): slug is string =>
              typeof slug === "string" && /^[a-z0-9][a-z0-9-]{1,80}$/.test(slug),
          )
          .slice(0, 10)
      : [];
  await Promise.all(
    slugs.flatMap((slug) => [
      env.LINKS_KV.delete(`${linkCachePrefix}${slug}`),
      env.LINKS_KV.delete(`${missingCachePrefix}${slug}`),
    ]),
  );
  return Response.json({ purged: slugs.length });
}

function databaseClick(message: ClickMessage) {
  return {
    app_id: message.appId,
    clicked_at: message.clickedAt,
    dedupe_key: message.dedupeKey,
    destination_platform: message.destinationPlatform,
    fbclid: message.fbclid,
    gbraid: message.gbraid,
    gclid: message.gclid,
    id: message.clickId,
    is_bot: message.isBot,
    is_test: message.isTest,
    network_prefix_hash: `\\x${message.networkPrefixHash}`,
    organization_id: message.organizationId,
    platform_hint: message.platformHint,
    referrer_parameters: message.referrerParameters,
    request_id: message.requestId,
    smart_link_id: message.smartLinkId,
    ttclid: message.ttclid,
    user_agent_hash: `\\x${message.userAgentHash}`,
    utm_parameters: message.utmParameters,
    wbraid: message.wbraid,
  };
}

async function persistClickBatch(batch: MessageBatch<ClickMessage>, env: Env) {
  const validMessages: Array<{ body: ClickMessage; message: Message<ClickMessage> }> = [];
  for (const message of batch.messages) {
    const parsed = clickMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      console.error(
        JSON.stringify({ message: "invalid click queue message", queueMessageId: message.id }),
      );
      message.ack();
      continue;
    }
    validMessages.push({ body: parsed.data, message });
  }
  if (validMessages.length === 0) return;

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/link_clicks?on_conflict=app_id,dedupe_key`,
    {
      method: "POST",
      headers: {
        ...serviceHeaders(env),
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(validMessages.map(({ body }) => databaseClick(body))),
    },
  );

  if (!response.ok) {
    console.error(
      JSON.stringify({ message: "click batch persistence failed", status: response.status }),
    );
    for (const { message } of validMessages) message.retry({ delaySeconds: 30 });
    return;
  }
  for (const { message } of validMessages) message.ack();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      const association = associationResponse(url.pathname);
      if (association) return secureResponse(association);
      assertLinksEnvironment(env);
      if (url.pathname === "/__admin/cache/purge") {
        return secureResponse(await handleCachePurge(request, env));
      }
      return secureResponse(await createSmartLinkHandler(createCloudflareRuntime(env))(request));
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "links request failed",
          path: url.pathname,
          error: error instanceof Error ? error.message : "unknown error",
        }),
      );
      return Response.json(
        { code: "service_temporarily_unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
  async queue(batch: MessageBatch<ClickMessage>, env: Env): Promise<void> {
    assertLinksEnvironment(env);
    await persistClickBatch(batch, env);
  },
} satisfies ExportedHandler<Env, ClickMessage>;
