import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const migration = (
  await Promise.all(
    migrationFiles.map((file) =>
      readFile(new URL(file, migrationDirectory), "utf8"),
    ),
  )
).join("\n");
const seed = await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8");
const databaseTests = await readFile(
  new URL("../supabase/tests/attruvi_schema_test.sql", import.meta.url),
  "utf8",
);

const requiredTables = [
  "organizations",
  "organization_members",
  "profiles",
  "apps",
  "app_platforms",
  "public_sdk_keys",
  "sources",
  "campaigns",
  "ad_groups",
  "ads",
  "smart_links",
  "link_destinations",
  "link_clicks",
  "installations",
  "identities",
  "attribution_candidates",
  "attributions",
  "events",
  "sessions",
  "purchases",
  "subscriptions",
  "connector_accounts",
  "connector_sync_runs",
  "ad_costs",
  "postback_destinations",
  "postback_jobs",
  "postback_attempts",
  "daily_metrics",
  "audit_log",
];

for (const table of requiredTables) {
  assert.match(migration, new RegExp(`create table public\\.${table}\\s*\\(`, "i"), `${table} falta`);
  assert.match(
    migration,
    new RegExp(`alter table public\\.%I enable row level security|alter table public\\.${table} enable row level security`, "i"),
    `RLS no se activa para ${table}`,
  );
}

assert.doesNotMatch(migration, /\b(real|double precision)\b/i, "El esquema no debe usar flotantes");
assert.match(migration, /value_minor bigint/i);
assert.match(migration, /amount_minor bigint/i);
assert.match(migration, /spend_minor bigint/i);
assert.match(migration, /unique \(app_id, event_id\)/i);
assert.match(migration, /security definer[\s\S]+set search_path = ''/i);
assert.match(migration, /for update skip locked/i);
assert.match(migration, /Partition monthly by occurred_at/i);
assert.match(migration, /ensure_personal_workspace/i);
assert.match(migration, /complete_personal_onboarding/i);
assert.match(migration, /organizations_one_personal_workspace_per_creator/i);
assert.match(migration, /create or replace function public\.upsert_personal_app\(payload jsonb\)/i);
assert.match(migration, /create or replace function public\.upsert_personal_smart_link\(payload jsonb\)/i);
assert.match(migration, /create or replace function public\.resolve_smart_link\(requested_slug text\)/i);
assert.match(migration, /create or replace function public\.resolve_ingest_app_key\(provided_key_hash text\)/i);
assert.match(migration, /create or replace function public\.ingest_sdk_messages\(payload jsonb\)/i);
assert.match(migration, /create or replace function public\.read_sdk_attribution\(/i);
assert.match(migration, /grant execute on function public\.ingest_sdk_messages\(jsonb\) to service_role/i);
assert.match(migration, /installation_access_token_hash bytea/i);
assert.match(migration, /revoke all on function public\.rls_auto_enable\(\) from public, anon, authenticated/i);
assert.match(migration, /create index if not exists events_installation_fk_idx/i);
assert.match(migration, /create index if not exists public_sdk_keys_app_fk_idx/i);
assert.match(migration, /grant execute on function public\.resolve_smart_link\(text\)[\s\S]*?to service_role/i);
assert.match(migration, /create unique index link_clicks_app_dedupe_unique/i);
assert.match(migration, /smart_links_slug_not_reserved/i);
assert.match(migration, /link_destinations_https/i);
assert.match(
  migration,
  /revoke all on function public\.ensure_personal_workspace\(text\)[\s\S]+grant execute[\s\S]+to authenticated/i,
);

for (const source of ["google_ads", "meta_ads", "tiktok_ads", "affiliate", "influencer", "organic"]) {
  assert.match(seed, new RegExp(`'${source}'`, "i"), `el seed no contiene ${source}`);
}

assert.match(seed, /'ios',[\s\S]+https:\/\/apps\.apple\.com/i, "el seed no contiene destino iOS");
assert.match(seed, /'web',[\s\S]+https:\/\/example\.com\/app/i, "el seed no contiene fallback web");

for (const proof of [
  "otra organización",
  "dos reintentos del mismo evento",
  "jerarquía campaña, grupo y anuncio",
  "mantienen precisión",
  "dashboard útil",
  "ingestión idempotente",
]) {
  assert.match(databaseTests, new RegExp(proof, "i"), `falta la prueba: ${proof}`);
}

console.log(`Supabase schema contract validated from ${root}`);
