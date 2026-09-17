import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || typeof data?.claims?.sub !== "string") {
    return Response.json(
      { error: "Debes iniciar sesión." },
      { headers: { "Cache-Control": "no-store" }, status: 401 },
    );
  }

  return Response.json(
    { authenticated: true, userId: data.claims.sub },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
