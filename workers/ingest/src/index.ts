import { eventBatchSchema } from "@attruvi/core";

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ service: "attruvi-ingest", status: "ok" });
      }

      if (request.method === "POST" && url.pathname === "/v1/events/batch") {
        const contentLength = Number(request.headers.get("content-length") ?? "0");
        if (contentLength > 256_000) {
          return json({ code: "payload_too_large" }, 413);
        }

        const parsed = eventBatchSchema.safeParse(await request.json());
        if (!parsed.success) {
          return json({ code: "invalid_event_batch" }, 400);
        }

        return json(
          {
            status: "validated",
            batchId: parsed.data.batchId,
            accepted: parsed.data.events.length,
          },
          202,
        );
      }

      return json({ code: "not_found" }, 404);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "ingest request failed",
          path: url.pathname,
          error: error instanceof Error ? error.message : "unknown error",
        }),
      );
      return json({ code: "invalid_json" }, 400);
    }
  },
} satisfies ExportedHandler<Env>;
