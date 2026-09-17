import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { spawnSync } from "node:child_process";
import path from "node:path";

const required = [
  "ATTRUVI_SMOKE_BASE_URL",
  "ATTRUVI_SMOKE_SUPABASE_URL",
  "ATTRUVI_SMOKE_SUPABASE_PUBLISHABLE_KEY",
  "ATTRUVI_SMOKE_EMAIL",
  "ATTRUVI_SMOKE_PASSWORD",
];

for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`Missing ${name}`);
}

const baseUrl = new URL(process.env.ATTRUVI_SMOKE_BASE_URL).origin;
const supabaseUrl = new URL(process.env.ATTRUVI_SMOKE_SUPABASE_URL).origin;
const publishableKey = process.env.ATTRUVI_SMOKE_SUPABASE_PUBLISHABLE_KEY;

const loginClient = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await loginClient.auth.signInWithPassword({
  email: process.env.ATTRUVI_SMOKE_EMAIL,
  password: process.env.ATTRUVI_SMOKE_PASSWORD,
});

if (error || !data.session || !data.user) {
  throw new Error(`Password sign-in failed: ${error?.code ?? "missing_session"}`);
}

if (process.env.ATTRUVI_SMOKE_REVOKE_ONLY === "true") {
  const { error: revokeError } = await loginClient.auth.signOut({ scope: "global" });
  if (revokeError) throw new Error(`Session revocation failed: ${revokeError.code}`);
  console.log(JSON.stringify({ revoked: true }));
} else {

let responseCookies = [];
const ssrClient = createServerClient(supabaseUrl, publishableKey, {
  cookies: {
    getAll: () => [],
    setAll: (cookies) => {
      responseCookies = cookies;
    },
  },
});
const { error: sessionError } = await ssrClient.auth.setSession({
  access_token: data.session.access_token,
  refresh_token: data.session.refresh_token,
});

if (sessionError) throw new Error(`SSR session failed: ${sessionError.code}`);

const cookie = responseCookies
  .map(({ name, value }) => `${name}=${value}`)
  .join("; ");
const verificationClient = createServerClient(supabaseUrl, publishableKey, {
  cookies: {
    getAll: () => responseCookies,
    setAll: () => {},
  },
});
const { data: verified, error: verificationError } =
  await verificationClient.auth.getClaims();
if (verificationError || typeof verified?.claims?.sub !== "string") {
  throw new Error(`Generated SSR cookies are invalid: ${verificationError?.code ?? "missing_claims"}`);
}
let status;
let location = null;
let body;

if (process.env.ATTRUVI_SMOKE_VERCEL_CLI === "true") {
  const vercelEntry = process.env.ATTRUVI_SMOKE_VERCEL_CLI_PATH ||
    (process.platform === "win32"
      ? path.join(
          process.env.APPDATA ?? "",
          "npm",
          "node_modules",
          "vercel",
          "dist",
          "index.js",
        )
      : "vercel");
  const command = process.platform === "win32" ? process.execPath : vercelEntry;
  const prefix = process.platform === "win32" ? [vercelEntry] : [];
  const result = spawnSync(
    command,
    [
      ...prefix,
      "curl",
      `${baseUrl}/dashboard`,
      "--cookie",
      cookie,
      "--include",
      "--silent",
      "--show-error",
      "--write-out",
      "\nATTRUVI_STATUS:%{http_code}",
    ],
    { encoding: "utf8", timeout: 90_000 },
  );
  if (result.error) {
    throw new Error(`Vercel smoke request could not start: ${result.error.code ?? "unknown"}`);
  }
  if (result.status !== 0) {
    throw new Error(`Vercel smoke request failed: exit=${result.status}`);
  }
  const marker = result.stdout.lastIndexOf("\nATTRUVI_STATUS:");
  if (marker < 0) throw new Error("Vercel smoke response has no status marker");
  body = result.stdout.slice(0, marker);
  status = Number(result.stdout.slice(marker + 16).trim());
  location = body.match(/^location:\s*(.+)$/im)?.[1]?.trim() ?? null;
} else {
  const dashboard = await fetch(`${baseUrl}/dashboard`, {
    headers: { cookie },
    redirect: "manual",
  });
  status = dashboard.status;
  location = dashboard.headers.get("location");
  body = await dashboard.text();
}
const hasDashboard =
  body.includes("Qué anuncios generan valor") || body.includes("Resumen");

if (status !== 200 || !hasDashboard) {
  throw new Error(
    `Dashboard session failed: status=${status} location=${location ?? "none"}`,
  );
}

console.log(
  JSON.stringify({
    authenticated: true,
    cookieCount: responseCookies.length,
    dashboardStatus: status,
    hasDashboard,
  }),
);
}
