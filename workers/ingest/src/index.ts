import { consumeIngestBatch } from "./consumer";
import { type DeadLetter, type QueuedIngestMessage } from "./contracts";
import { createIngestHandler } from "./router";
import { createCloudflareRuntime, writeMetric } from "./runtime";
import { persistIngestMessages, SupabasePersistenceError } from "./supabase";
import { assertIngestEnvironment, secureIngestResponse } from "./environment";

function safeErrorCode(error: unknown): string {
  if (error instanceof SupabasePersistenceError) return `supabase_${error.status}`;
  if (error instanceof Error) {
    const sanitized = error.message
      .slice(0, 120)
      .replace(/[^A-Za-z0-9_.:-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return sanitized || error.name;
  }
  return "unknown_error";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      assertIngestEnvironment(env);
      return secureIngestResponse(await createIngestHandler(createCloudflareRuntime(env))(request));
    } catch (error) {
      const requestId = crypto.randomUUID();
      console.error(
        JSON.stringify({
          message: "ingest request failed",
          path: new URL(request.url).pathname,
          requestId,
          error: safeErrorCode(error),
        }),
      );
      writeMetric(env, "rejected", 1, { code: "service_unavailable" });
      return Response.json(
        { code: "service_temporarily_unavailable", requestId },
        { status: 503, headers: { "cache-control": "no-store", "x-request-id": requestId } },
      );
    }
  },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    assertIngestEnvironment(env);
    await consumeIngestBatch(batch, {
      persist: (messages: readonly QueuedIngestMessage[]) => persistIngestMessages(env, messages),
      async deadLetter(message: DeadLetter) {
        await env.DEAD_LETTER_QUEUE.send(message, { contentType: "json" });
      },
      metric: (name, value, dimensions) => writeMetric(env, name, value, dimensions),
      now: () => new Date(),
    });
  },
} satisfies ExportedHandler<Env, unknown>;
