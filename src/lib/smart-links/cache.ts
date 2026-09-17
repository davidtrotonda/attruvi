import "server-only";

import { createHmac, randomUUID } from "node:crypto";

export async function purgeSmartLinkCache(slugs: Array<string | null | undefined>) {
  const workerUrl = process.env.ATTRUVI_LINKS_WORKER_URL;
  const token = process.env.ATTRUVI_LINKS_SYNC_TOKEN;
  const validSlugs = [...new Set(slugs.filter((slug): slug is string => Boolean(slug)))];
  if (!workerUrl || !token || validSlugs.length === 0) return { configured: false, ok: true };

  try {
    const endpoint = new URL("/__admin/cache/purge", workerUrl);
    const body = JSON.stringify({ slugs: validSlugs });
    const timestamp = Date.now().toString();
    const nonce = randomUUID();
    const signature = createHmac("sha256", token).update(`${timestamp}.${nonce}.${body}`).digest("hex");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Attruvi-Nonce": nonce,
        "X-Attruvi-Signature": signature,
        "X-Attruvi-Timestamp": timestamp,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    return { configured: true, ok: response.ok };
  } catch {
    return { configured: true, ok: false };
  }
}
