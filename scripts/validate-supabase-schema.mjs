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
const databaseTestDirectory = new URL("../supabase/tests/", import.meta.url);
const databaseTests = (
  await Promise.all(
    (await readdir(databaseTestDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => readFile(new URL(file, databaseTestDirectory), "utf8")),
  )
).join("\n");

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
  "attribution_rule_sets",
  "events",
  "sessions",
  "purchases",
  "subscriptions",
  "app_users",
  "app_user_installations",
  "activity_sessions",
  "revenue_ledger",
  "revenue_validations",
  "subscription_events",
  "push_token_invalidations",
  "uninstall_inferences",
  "installation_activity_metrics",
  "app_user_metrics",
  "connector_accounts",
  "connector_sync_runs",
  "ad_costs",
  "ad_cost_mappings",
  "postback_destinations",
  "postback_jobs",
  "postback_attempts",
  "daily_metrics",
  "metric_dirty_days",
  "metric_rollup_runs",
  "metric_reconciliation_runs",
  "development_debug_events",
  "app_privacy_settings",
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
assert.match(migration, /create or replace function public\.ingest_sdk_messages_v2\(payload jsonb\)/i);
assert.match(migration, /create or replace function public\.ingest_sdk_messages_v3\(payload jsonb\)/i);
assert.match(migration, /session_timeout_minutes smallint not null default 30/i);
assert.match(migration, /revenue_reported_minor bigint/i);
assert.match(migration, /revenue_verified_minor bigint/i);
assert.match(migration, /unique \(app_id, transaction_id, event_type\)/i);
assert.match(migration, /create or replace function public\.record_push_token_invalidation\(/i);
assert.match(migration, /create or replace function public\.persist_ad_cost_page\(/i);
assert.match(migration, /create or replace function public\.upsert_manual_ad_costs\(/i);
assert.match(migration, /create or replace function public\.assign_ad_cost_campaign\(/i);
assert.match(migration, /create or replace function public\.schedule_due_connector_syncs\(/i);
assert.match(migration, /create or replace function public\.read_ad_cost_totals\(/i);
assert.match(migration, /create or replace function private\.apply_ad_cost_mapping\(/i);
assert.match(migration, /create or replace function private\.compute_daily_metrics\(/i);
assert.match(migration, /create or replace function public\.recalculate_daily_metrics\(/i);
assert.match(migration, /create or replace function public\.reconcile_daily_metrics\(/i);
assert.match(migration, /create or replace function public\.query_metric_rollups\(/i);
assert.match(migration, /metric_version text not null/i);
assert.match(migration, /ltv_eligible_d90 bigint not null/i);
assert.match(migration, /uninstall_inferred bigint not null/i);
assert.match(migration, /grant execute on function public\.recalculate_daily_metrics[\s\S]+to service_role/i);
assert.match(migration, /create table private\.connector_secrets\s*\(/i);
assert.match(migration, /grant execute on function public\.store_connector_secret[\s\S]+to service_role/i);
assert.match(migration, /create index connector_sync_runs_claim_idx/i);
assert.match(migration, /create index if not exists ad_cost_mappings_account_fk_idx/i);
assert.match(migration, /create index if not exists ad_cost_mappings_app_fk_idx/i);
assert.match(migration, /create index if not exists ad_cost_mappings_created_by_fk_idx/i);
assert.match(migration, /correction_version integer not null default 1/i);
assert.match(migration, /create or replace function public\.attribute_installation\(/i);
assert.match(migration, /create or replace function public\.get_attribution_explanation\(/i);
assert.match(migration, /create or replace function public\.read_sdk_attribution\(/i);
assert.match(migration, /grant execute on function public\.ingest_sdk_messages\(jsonb\) to service_role/i);
assert.match(migration, /grant execute on function public\.ingest_sdk_messages_v2\(jsonb\) to service_role/i);
assert.match(migration, /installation_access_token_hash bytea/i);
assert.match(migration, /revoke all on function public\.rls_auto_enable\(\) from public, anon, authenticated/i);
assert.match(migration, /create index if not exists events_installation_fk_idx/i);
assert.match(migration, /create index if not exists public_sdk_keys_app_fk_idx/i);
assert.match(migration, /create or replace function public\.create_public_sdk_key\(/i);
assert.match(migration, /create or replace function public\.create_development_test_event\(/i);
assert.match(migration, /development_dry_run/i);
assert.match(migration, /grant execute on function public\.resolve_smart_link\(text\)[\s\S]*?to service_role/i);
assert.match(migration, /create unique index link_clicks_app_dedupe_unique/i);
assert.match(migration, /smart_links_slug_not_reserved/i);
assert.match(migration, /link_destinations_https/i);
assert.match(
  migration,
  /revoke all on function public\.ensure_personal_workspace\(text\)[\s\S]+grant execute[\s\S]+to authenticated/i,
);

for (const source of ["google_ads", "meta_ads", "tiktok_ads", "manual", "affiliate", "influencer", "organic"]) {
  assert.match(seed, new RegExp(`'${source}'`, "i"), `el seed no contiene ${source}`);
}

assert.match(seed, /'ios',[\s\S]+https:\/\/apps\.apple\.com/i, "el seed no contiene destino iOS");
assert.match(seed, /'web',[\s\S]+https:\/\/example\.com\/app/i, "el seed no contiene fallback web");
assert.match(seed, /insert into auth\.identities/i, "el usuario demo no tiene identidad de Auth");
assert.match(seed, /email_change_token_new/i, "el usuario demo puede romper GoTrue por tokens NULL");

for (const proof of [
  "otra organización",
  "dos reintentos del mismo evento",
  "jerarquía campaña, grupo y anuncio",
  "mantienen precisión",
  "dashboard útil",
  "ingestión idempotente",
  "click_id directo",
  "Play Install Referrer",
  "dos candidatos",
  "clic expirado",
  "primer open duplicado",
  "reinstalación",
  "reactivación",
  "sin consentimiento",
  "iOS sin señal",
  "dry-run",
  "compra duplicada",
  "reembolso",
  "renovación",
  "eventos fuera de orden",
  "monedas diferentes",
  "borrado de usuario",
  "dato corregido posteriormente",
  "campaña eliminada",
  "monedas diferentes",
  "denominadores cero",
  "reconciliador detecta una desviación",
  "recálculo incremental elimina la desviación",
  "conservan los datos raw",
  "recorrido demo desde cero",
  "postback dry-run",
  "replay OAuth se rechaza",
  "todas las tablas públicas tienen RLS activado",
  "viewer no cambia retención",
  "outsider no exporta datos",
]) {
  assert.match(databaseTests, new RegExp(proof, "i"), `falta la prueba: ${proof}`);
}

console.log(`Supabase schema contract validated from ${root}`);
