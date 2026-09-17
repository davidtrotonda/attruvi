import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runMetricRollupBatch } from "@/lib/metrics/rollup";

export const maxDuration = 60;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    return NextResponse.json(await runMetricRollupBatch(100), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "No se ha podido ejecutar el recálculo de métricas." },
      { status: 503 },
    );
  }
}

export const GET = run;
export const POST = run;
