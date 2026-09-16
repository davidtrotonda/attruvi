import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const migration = await readFile(
  new URL("../supabase/migrations/20260916230710_initial_attruvi_schema.sql", import.meta.url),
  "utf8",
);
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

for (const source of ["google_ads", "meta_ads", "tiktok_ads", "affiliate", "influencer", "organic"]) {
  assert.match(seed, new RegExp(`'${source}'`, "i"), `el seed no contiene ${source}`);
}

for (const proof of [
  "otra organización",
  "dos reintentos del mismo evento",
  "jerarquía campaña, grupo y anuncio",
  "mantienen precisión",
  "dashboard útil",
]) {
  assert.match(databaseTests, new RegExp(proof, "i"), `falta la prueba: ${proof}`);
}

console.log(`Supabase schema contract validated from ${root}`);
