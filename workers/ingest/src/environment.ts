export function assertIngestEnvironment(env: Env) {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CLICK_HASH_SALT"].filter(
    (name) => typeof env[name as keyof Env] !== "string" || String(env[name as keyof Env]).trim().length < 20,
  );
  let validUrl = false;
  try {
    const url = new URL(env.SUPABASE_URL);
    validUrl = url.protocol === "https:" || url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    validUrl = false;
  }
  if (
    !env.APP_CONFIG_CACHE || !env.EVENT_QUEUE || !env.DEAD_LETTER_QUEUE ||
    missing.length > 0 || !validUrl
  ) {
    throw new Error(`invalid_worker_environment:${[...missing, ...(validUrl ? [] : ["SUPABASE_URL"])].join(",")}`);
  }
}

export function secureIngestResponse(response: Response) {
  const next = new Response(response.body, response);
  next.headers.set("Cache-Control", "no-store");
  next.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  next.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next.headers.set("Referrer-Policy", "no-referrer");
  next.headers.set("X-Content-Type-Options", "nosniff");
  return next;
}
