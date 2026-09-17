import { eventBatchSchema, sdkEventBatchSchema } from "@attruvi/core";

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

        const body = await request.json();
        const isSdkBatch = typeof body === "object" && body !== null && "sdkVersion" in body;
        const parsed = (isSdkBatch ? sdkEventBatchSchema : eventBatchSchema).safeParse(body);
        if (!parsed.success) {
          return json({ code: "invalid_event_batch" }, 400);
        }

        if (isSdkBatch && !/^attruvi_[A-Za-z0-9_-]{8,}$/.test(request.headers.get("x-attruvi-app-key") ?? "")) {
          return json({ code: "invalid_app_key" }, 401);
        }

        return json(
          {
            status: "validated",
            batchId: parsed.data.batchId,
            accepted: parsed.data.events.length,
            receivedAt: new Date().toISOString(),
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
