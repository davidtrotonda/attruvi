import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/navigation";
import { verifyEmailOtp } from "@/lib/auth/server-flows";
import {
  ensurePersonalWorkspace,
  getVerifiedIdentity,
} from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedOtpTypes = new Set<EmailOtpType>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const requestedType = requestUrl.searchParams.get("type");
  const fallback = requestedType === "recovery" ? "/auth/reset" : "/onboarding";
  const nextPath =
    requestedType === "recovery"
      ? "/auth/reset"
      : sanitizeNextPath(requestUrl.searchParams.get("next"), fallback);

  if (
    !tokenHash ||
    !requestedType ||
    !allowedOtpTypes.has(requestedType as EmailOtpType)
  ) {
    return NextResponse.redirect(
      new URL("/?auth=invalid-link", requestUrl.origin),
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const verification = await verifyEmailOtp(
      supabase.auth,
      tokenHash,
      requestedType as EmailOtpType,
    );
    if (!verification.ok) throw new Error("otp_verification_failed");

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
