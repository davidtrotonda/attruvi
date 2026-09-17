import { NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/navigation";
import { exchangePkceCode } from "@/lib/auth/server-flows";
import {
  ensurePersonalWorkspace,
  getVerifiedIdentity,
} from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = sanitizeNextPath(
    requestUrl.searchParams.get("next"),
    "/dashboard",
  );

  if (!code) {
    return NextResponse.redirect(
      new URL("/?auth=invalid-link", requestUrl.origin),
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const exchange = await exchangePkceCode(supabase.auth, code);
    if (!exchange.ok) throw new Error("pkce_exchange_failed");

    const identity = await getVerifiedIdentity(supabase);
    if (!identity) throw new Error("missing_verified_identity");
    await ensurePersonalWorkspace(supabase, identity.displayName);

    return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  } catch {
    return NextResponse.redirect(
      new URL("/?auth=invalid-link", requestUrl.origin),
    );
  }
}
