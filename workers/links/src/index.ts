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
        return json({ service: "attruvi-links", status: "ok" });
      }

      return json(
        {
          code: "smart_link_not_configured",
          message: "El enlace todavía no tiene un destino configurado.",
        },
        404,
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "links request failed",
          path: url.pathname,
          error: error instanceof Error ? error.message : "unknown error",
        }),
      );
      return json({ code: "internal_error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
