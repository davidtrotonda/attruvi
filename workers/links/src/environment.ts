export function assertLinksEnvironment(env: Env) {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CLICK_HASH_SALT", "LINKS_SYNC_TOKEN"].filter(
    (name) => typeof env[name as keyof Env] !== "string" || String(env[name as keyof Env]).trim().length < 20,
  );
  let validUrl = false;
  try {
    const url = new URL(env.SUPABASE_URL);
    validUrl = url.protocol === "https:" || url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    validUrl = false;
  }
  if (!env.LINKS_KV || !env.CLICK_QUEUE || missing.length > 0 || !validUrl) {
    const invalid = new Set([...missing, ...(validUrl ? [] : ["SUPABASE_URL"])]);
    throw new Error(`invalid_worker_environment:${[...invalid].join(",")}`);
  }
}

export function secureResponse(response: Response) {
  const next = new Response(response.body, response);
  next.headers.set("Cross-Origin-Resource-Policy", "same-site");
  next.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next.headers.set("Referrer-Policy", "no-referrer");
  next.headers.set("X-Content-Type-Options", "nosniff");
  return next;
}
