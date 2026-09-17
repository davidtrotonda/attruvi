import { createHealthPayload } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET() {
  const requestId = crypto.randomUUID();
  return Response.json(createHealthPayload(requestId), {
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}
