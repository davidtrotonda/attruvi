import { createHealthPayload, probeHealthDependency } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const payload = createHealthPayload(requestId);
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  const body = deep
    ? await (async () => {
        const [links, ingest] = await Promise.all([
          probeHealthDependency(process.env.ATTRUVI_LINKS_BASE_URL, "attruvi-links"),
          probeHealthDependency(process.env.ATTRUVI_INGEST_BASE_URL, "attruvi-ingest"),
        ]);
        return {
          ...payload,
          dependencies: { ingest, links },
          status: links.status === "ok" && ingest.status === "ok" ? "ok" : "degraded",
        };
      })()
    : payload;
  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}
