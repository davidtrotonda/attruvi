import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runPostbackBatch } from "@/lib/postbacks/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runPostbackBatch(25));
  } catch {
    return NextResponse.json({ error: "postback_batch_failed" }, { status: 500 });
  }
}
