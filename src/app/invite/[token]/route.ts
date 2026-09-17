import { NextResponse } from "next/server";
import { getVerifiedIdentity } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const requestUrl = new URL(request.url);
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return NextResponse.redirect(new URL("/?invite=invalid", requestUrl.origin));
  const supabase = await createSupabaseServerClient();
  const identity = await getVerifiedIdentity(supabase);
  if (!identity) {
    const next = `/invite/${encodeURIComponent(token)}`;
    return NextResponse.redirect(new URL(`/?auth=required&next=${encodeURIComponent(next)}`, requestUrl.origin));
  }
  const { data, error } = await supabase.rpc("accept_organization_invitation", { requested_token: token });
  if (error) return NextResponse.redirect(new URL("/dashboard/settings?error=invitation", requestUrl.origin));
  const accepted = Array.isArray(data) ? data[0] : data;
  const query = new URLSearchParams({ invitation: "accepted" });
  if (accepted?.organization_slug) query.set("workspace", accepted.organization_slug);
  if (accepted?.first_app_slug) query.set("app", accepted.first_app_slug);
  return NextResponse.redirect(new URL(`/dashboard/settings?${query.toString()}`, requestUrl.origin));
}
