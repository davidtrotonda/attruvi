import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPrivateApi, isProtectedPage } from "@/lib/auth/navigation";
import { getSupabasePublicConfig } from "./config";

function privateApiError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { headers: { "Cache-Control": "no-store" }, status },
  );
}

export async function updateSupabaseSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const config = getSupabasePublicConfig();

  if (!config) {
    if (isPrivateApi(pathname)) {
      return privateApiError("Servicio de acceso no configurado.", 503);
    }

    const unavailableUrl = request.nextUrl.clone();
    unavailableUrl.pathname = "/";
    unavailableUrl.search = "?auth=unavailable";
    return NextResponse.redirect(unavailableUrl);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, options, value }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const isAuthenticated = !error && typeof data?.claims?.sub === "string";

  if (!isAuthenticated && isPrivateApi(pathname)) {
    return privateApiError("Debes iniciar sesión.", 401);
  }

  if (!isAuthenticated && isProtectedPage(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/";
    loginUrl.search = "";
    loginUrl.searchParams.set("auth", "required");
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
