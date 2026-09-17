import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";

type AuthClient = SupabaseClient["auth"];

export async function exchangePkceCode(auth: AuthClient, code: string) {
  try {
    const { error } = await auth.exchangeCodeForSession(code);
    return { ok: !error } as const;
  } catch {
    return { ok: false } as const;
  }
}

export async function verifyEmailOtp(
  auth: AuthClient,
  tokenHash: string,
  type: EmailOtpType,
) {
  try {
    const { error } = await auth.verifyOtp({ token_hash: tokenHash, type });
    return { ok: !error } as const;
  } catch {
    return { ok: false } as const;
  }
}
