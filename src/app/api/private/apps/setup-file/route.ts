import { NextResponse } from "next/server";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { getSetupAssistant } from "@/lib/data/setup";

export async function GET(request: Request) {
  const identity = await requireVerifiedIdentity();
  const url = new URL(request.url);
  const setup = await getSetupAssistant(identity, {
    app: url.searchParams.get("app") ?? undefined,
    workspace: url.searchParams.get("workspace") ?? undefined,
  });
  if (!setup.selectedApp || !("markdown" in setup)) return NextResponse.json({ error: "app_not_found" }, { status: 404 });
  return new NextResponse(setup.markdown, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="ATTRUVI_SETUP.md"',
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
