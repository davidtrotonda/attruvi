create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create type public.organization_role as enum ('owner', 'admin', 'viewer');
create type public.app_platform_kind as enum ('ios', 'android');
create type public.environment_kind as enum ('development', 'production');
create type public.record_status as enum ('active', 'paused', 'disabled', 'revoked');
create type public.source_kind as enum ('google_ads', 'meta_ads', 'tiktok_ads', 'affiliate', 'influencer', 'organic', 'other');
create type public.attribution_method as enum ('direct_link', 'install_referrer', 'network_signal', 'probabilistic', 'organic', 'manual');
create type public.job_status as enum ('pending', 'processing', 'succeeded', 'retryable_failed', 'permanently_failed', 'skipped');
create type public.sync_status as enum ('pending', 'running', 'succeeded', 'failed');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'expired');

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (display_name is null or char_length(display_name) between 1 and 120)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  default_timezone text not null default 'UTC',
  default_currency text not null default 'EUR',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_length check (char_length(name) between 1 and 120),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  constraint organizations_currency_iso check (default_currency ~ '^[A-Z]{3}$')
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.organization_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_unique_user unique (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id, organization_id);

create table public.apps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  timezone text not null default 'UTC',
  currency text not null default 'EUR',
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apps_name_length check (char_length(name) between 1 and 120),
  constraint apps_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  constraint apps_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint apps_unique_slug unique (organization_id, slug),
  constraint apps_tenant_identity unique (id, organization_id)
);

create index apps_organization_status_idx on public.apps (organization_id, status);

create table public.app_platforms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  platform public.app_platform_kind not null,
  ios_bundle_id text,
  android_package_name text,
  store_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_platforms_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint app_platforms_unique_platform unique (app_id, platform),
  constraint app_platforms_tenant_identity unique (id, organization_id, app_id),
  constraint app_platforms_identifier_matches_platform check (
    (platform = 'ios' and ios_bundle_id is not null and android_package_name is null)
    or (platform = 'android' and android_package_name is not null and ios_bundle_id is null)
  )
);

create index app_platforms_org_app_idx on public.app_platforms (organization_id, app_id);

create table public.public_sdk_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  key_hash bytea not null,
  visible_prefix text not null,
  environment public.environment_kind not null,
  status public.record_status not null default 'active',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_sdk_keys_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint public_sdk_keys_hash_unique unique (key_hash),
  constraint public_sdk_keys_prefix_length check (char_length(visible_prefix) between 8 and 32),
  constraint public_sdk_keys_revocation_state check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked' and revoked_at is null)
  )
);

create index public_sdk_keys_app_status_idx on public.public_sdk_keys (app_id, environment, status);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  kind public.source_kind not null,
  name text not null,
  external_id text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint sources_tenant_identity unique (id, organization_id, app_id),
  constraint sources_unique_name unique (app_id, kind, name)
);

create unique index sources_external_id_unique_idx
  on public.sources (app_id, kind, external_id)
  where external_id is not null;
create index sources_org_app_kind_idx on public.sources (organization_id, app_id, kind);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  source_id uuid not null,
  name text not null,
  external_id text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_source_fk foreign key (source_id, organization_id, app_id)
    references public.sources (id, organization_id, app_id) on delete cascade,
  constraint campaigns_tenant_identity unique (id, organization_id, app_id),
  constraint campaigns_hierarchy_identity unique (id, source_id, organization_id, app_id)
);

create unique index campaigns_external_id_unique_idx
  on public.campaigns (app_id, source_id, external_id)
  where external_id is not null;
create index campaigns_source_status_idx on public.campaigns (source_id, status);

create table public.ad_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  source_id uuid not null,
  campaign_id uuid not null,
  name text not null,
  external_id text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_groups_campaign_fk foreign key (campaign_id, source_id, organization_id, app_id)
    references public.campaigns (id, source_id, organization_id, app_id) on delete cascade,
  constraint ad_groups_tenant_identity unique (id, organization_id, app_id),
  constraint ad_groups_hierarchy_identity unique (id, campaign_id, source_id, organization_id, app_id)
);

create unique index ad_groups_external_id_unique_idx
  on public.ad_groups (app_id, campaign_id, external_id)
  where external_id is not null;
create index ad_groups_campaign_status_idx on public.ad_groups (campaign_id, status);

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  source_id uuid not null,
  campaign_id uuid not null,
  ad_group_id uuid not null,
  name text not null,
  external_id text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ads_ad_group_fk foreign key (ad_group_id, campaign_id, source_id, organization_id, app_id)
    references public.ad_groups (id, campaign_id, source_id, organization_id, app_id) on delete cascade,
  constraint ads_tenant_identity unique (id, organization_id, app_id),
  constraint ads_hierarchy_identity unique (id, ad_group_id, campaign_id, source_id, organization_id, app_id)
);

create unique index ads_external_id_unique_idx
  on public.ads (app_id, ad_group_id, external_id)
  where external_id is not null;
create index ads_ad_group_status_idx on public.ads (ad_group_id, status);

create table public.smart_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  source_id uuid references public.sources (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  ad_group_id uuid references public.ad_groups (id) on delete set null,
  ad_id uuid references public.ads (id) on delete set null,
  name text not null,
  slug text not null unique,
  status public.record_status not null default 'active',
  attribution_window_days smallint not null default 7,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  affiliate_id text,
  creator_id text,
  deep_link_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint smart_links_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint smart_links_tenant_identity unique (id, organization_id, app_id),
  constraint smart_links_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  constraint smart_links_window check (attribution_window_days between 1 and 90)
);

create index smart_links_org_app_status_idx on public.smart_links (organization_id, app_id, status);

create table public.link_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  smart_link_id uuid not null,
  platform text not null,
  destination_url text not null,
  deep_link_url text,
  priority smallint not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint link_destinations_link_fk foreign key (smart_link_id, organization_id, app_id)
    references public.smart_links (id, organization_id, app_id) on delete cascade,
  constraint link_destinations_platform check (platform in ('ios', 'android', 'web')),
  constraint link_destinations_unique_platform unique (smart_link_id, platform)
);

create index link_destinations_org_app_idx on public.link_destinations (organization_id, app_id);

create table public.link_clicks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  smart_link_id uuid not null,
  request_id uuid not null,
  clicked_at timestamptz not null,
  platform_hint text,
  destination_platform text,
  utm_parameters jsonb not null default '{}'::jsonb,
  gclid text,
  gbraid text,
  wbraid text,
  fbclid text,
  ttclid text,
  user_agent_hash bytea,
  network_prefix_hash bytea,
  is_bot boolean not null default false,
  created_at timestamptz not null default now(),
  constraint link_clicks_link_fk foreign key (smart_link_id, organization_id, app_id)
    references public.smart_links (id, organization_id, app_id) on delete cascade,
  constraint link_clicks_tenant_identity unique (id, organization_id, app_id),
  constraint link_clicks_request_id_unique unique (app_id, request_id),
  constraint link_clicks_utm_object check (jsonb_typeof(utm_parameters) = 'object')
);

create index link_clicks_app_time_idx on public.link_clicks (app_id, clicked_at desc);
create index link_clicks_link_time_idx on public.link_clicks (smart_link_id, clicked_at desc);
create index link_clicks_gclid_idx on public.link_clicks (app_id, gclid) where gclid is not null;
create index link_clicks_fbclid_idx on public.link_clicks (app_id, fbclid) where fbclid is not null;
create index link_clicks_ttclid_idx on public.link_clicks (app_id, ttclid) where ttclid is not null;

create table public.installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  installation_key_hash bytea not null,
  platform public.app_platform_kind not null,
  environment public.environment_kind not null,
  first_open_at timestamptz not null,
  last_seen_at timestamptz not null,
  app_version text,
  sdk_version text,
  consent_state text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installations_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint installations_tenant_identity unique (id, organization_id, app_id),
  constraint installations_unique_key unique (app_id, environment, installation_key_hash),
  constraint installations_consent_state check (consent_state in ('unknown', 'granted', 'denied', 'limited')),
  constraint installations_seen_order check (last_seen_at >= first_open_at)
);

create index installations_app_first_open_idx on public.installations (app_id, first_open_at desc);

create table public.identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  installation_id uuid not null,
  identity_kind text not null,
  identity_hash bytea not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identities_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete cascade,
  constraint identities_kind check (identity_kind in ('anonymous', 'user')),
  constraint identities_validity check (valid_to is null or valid_to > valid_from),
  constraint identities_unique_active unique nulls not distinct (app_id, identity_kind, identity_hash, valid_to)
);

create index identities_installation_idx on public.identities (installation_id, valid_from desc);
create index identities_org_app_idx on public.identities (organization_id, app_id);

create table public.attribution_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  installation_id uuid not null,
  click_id uuid,
  source_id uuid references public.sources (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  ad_group_id uuid references public.ad_groups (id) on delete set null,
  ad_id uuid references public.ads (id) on delete set null,
  candidate_key text not null,
  method public.attribution_method not null,
  confidence numeric(5,4) not null,
  score integer not null,
  evidence jsonb not null default '{}'::jsonb,
  rule_version text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint attribution_candidates_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete cascade,
  constraint attribution_candidates_click_fk foreign key (click_id, organization_id, app_id)
    references public.link_clicks (id, organization_id, app_id) on delete set null (click_id),
  constraint attribution_candidates_tenant_identity unique (id, organization_id, app_id),
  constraint attribution_candidates_unique_key unique (app_id, installation_id, candidate_key, rule_version),
  constraint attribution_candidates_confidence check (confidence between 0 and 1),
  constraint attribution_candidates_evidence_object check (jsonb_typeof(evidence) = 'object')
);

create index attribution_candidates_installation_score_idx
  on public.attribution_candidates (installation_id, rule_version, score desc);

create table public.attributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  installation_id uuid not null,
  winning_candidate_id uuid,
  click_id uuid,
  source_id uuid references public.sources (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  ad_group_id uuid references public.ad_groups (id) on delete set null,
  ad_id uuid references public.ads (id) on delete set null,
  method public.attribution_method not null,
  confidence numeric(5,4) not null,
  evidence_summary jsonb not null default '{}'::jsonb,
  attribution_window_days smallint not null,
  rule_version text not null,
  attributed_at timestamptz not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attributions_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete cascade,
  constraint attributions_candidate_fk foreign key (winning_candidate_id, organization_id, app_id)
    references public.attribution_candidates (id, organization_id, app_id) on delete set null (winning_candidate_id),
  constraint attributions_click_fk foreign key (click_id, organization_id, app_id)
    references public.link_clicks (id, organization_id, app_id) on delete set null (click_id),
  constraint attributions_confidence check (confidence between 0 and 1),
  constraint attributions_window check (attribution_window_days between 1 and 90),
  constraint attributions_evidence_object check (jsonb_typeof(evidence_summary) = 'object')
);

create unique index attributions_current_installation_idx
  on public.attributions (app_id, installation_id)
  where is_current;
create unique index attributions_rule_version_idx
  on public.attributions (app_id, installation_id, rule_version);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  installation_id uuid not null,
  session_key text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  event_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete cascade,
  constraint sessions_tenant_identity unique (id, organization_id, app_id),
  constraint sessions_unique_key unique (app_id, installation_id, session_key),
  constraint sessions_time_order check (ended_at is null or ended_at >= started_at),
  constraint sessions_event_count check (event_count >= 0)
);

create index sessions_app_started_idx on public.sessions (app_id, started_at desc);
create index sessions_installation_started_idx on public.sessions (installation_id, started_at desc);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  installation_id uuid not null,
  session_id uuid,
  event_id uuid not null,
  idempotency_key text not null,
  name text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  properties jsonb not null default '{}'::jsonb,
  value_minor bigint,
  currency text,
  created_at timestamptz not null default now(),
  constraint events_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete cascade,
  constraint events_session_fk foreign key (session_id, organization_id, app_id)
    references public.sessions (id, organization_id, app_id) on delete set null (session_id),
  constraint events_tenant_identity unique (id, organization_id, app_id),
  constraint events_unique_event_id unique (app_id, event_id),
  constraint events_unique_idempotency_key unique (app_id, idempotency_key),
  constraint events_name_length check (char_length(name) between 1 and 80),
  constraint events_properties_object check (jsonb_typeof(properties) = 'object'),
  constraint events_money_pair check (
    (value_minor is null and currency is null)
    or (value_minor is not null and currency ~ '^[A-Z]{3}$')
  )
);

create index events_app_occurred_idx on public.events (app_id, occurred_at desc);
create index events_installation_occurred_idx on public.events (installation_id, occurred_at desc);
create index events_name_occurred_idx on public.events (app_id, name, occurred_at desc);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  installation_id uuid not null,
  event_id uuid not null,
  transaction_id text not null,
  order_id text,
  value_minor bigint not null,
  currency text not null,
  status text not null default 'reported',
  purchased_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchases_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete cascade,
  constraint purchases_event_fk foreign key (event_id, organization_id, app_id)
    references public.events (id, organization_id, app_id) on delete restrict,
  constraint purchases_unique_transaction unique (app_id, transaction_id),
  constraint purchases_unique_event unique (event_id),
  constraint purchases_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint purchases_status check (status in ('reported', 'verified', 'refunded', 'rejected'))
);

create index purchases_app_time_idx on public.purchases (app_id, purchased_at desc);
create index purchases_installation_time_idx on public.purchases (installation_id, purchased_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  installation_id uuid not null,
  external_subscription_id text not null,
  product_id text not null,
  platform public.app_platform_kind not null,
  status public.subscription_status not null,
  current_period_started_at timestamptz not null,
  current_period_ends_at timestamptz,
  cancelled_at timestamptz,
  revenue_minor bigint not null default 0,
  currency text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete cascade,
  constraint subscriptions_unique_external_id unique (app_id, external_subscription_id),
  constraint subscriptions_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint subscriptions_period_order check (
    current_period_ends_at is null or current_period_ends_at >= current_period_started_at
  )
);

create index subscriptions_app_status_idx on public.subscriptions (app_id, status, updated_at desc);

create table public.connector_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  provider public.source_kind not null,
  external_account_id text,
  external_account_hint text,
  secret_reference text,
  status public.record_status not null default 'disabled',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connector_accounts_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint connector_accounts_tenant_identity unique (id, organization_id, app_id),
  constraint connector_accounts_provider check (provider in ('google_ads', 'meta_ads', 'tiktok_ads', 'other'))
);

create unique index connector_accounts_external_unique_idx
  on public.connector_accounts (app_id, provider, external_account_id)
  where external_account_id is not null;
create index connector_accounts_app_status_idx on public.connector_accounts (app_id, status);

create table public.connector_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  connector_account_id uuid not null,
  status public.sync_status not null default 'pending',
  sync_from date,
  sync_to date,
  cursor text,
  rows_read integer not null default 0,
  rows_written integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connector_sync_runs_account_fk foreign key (connector_account_id, organization_id, app_id)
    references public.connector_accounts (id, organization_id, app_id) on delete cascade,
  constraint connector_sync_runs_counts check (rows_read >= 0 and rows_written >= 0),
  constraint connector_sync_runs_time_order check (finished_at is null or started_at is null or finished_at >= started_at)
);

create index connector_sync_runs_account_created_idx
  on public.connector_sync_runs (connector_account_id, created_at desc);
create index connector_sync_runs_app_status_idx on public.connector_sync_runs (app_id, status, created_at);

create table public.ad_costs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  connector_account_id uuid,
  source_id uuid not null references public.sources (id) on delete restrict,
  campaign_id uuid references public.campaigns (id) on delete set null,
  ad_group_id uuid references public.ad_groups (id) on delete set null,
  ad_id uuid references public.ads (id) on delete set null,
  cost_date date not null,
  amount_minor bigint not null,
  currency text not null,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  external_row_id text not null,
  data_hash bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_costs_account_fk foreign key (connector_account_id, organization_id, app_id)
    references public.connector_accounts (id, organization_id, app_id) on delete set null (connector_account_id),
  constraint ad_costs_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint ad_costs_nonnegative check (amount_minor >= 0 and impressions >= 0 and clicks >= 0)
);

create unique index ad_costs_external_row_unique_idx
  on public.ad_costs (app_id, connector_account_id, cost_date, external_row_id)
  nulls not distinct;
create index ad_costs_app_date_idx on public.ad_costs (app_id, cost_date desc);
create index ad_costs_campaign_date_idx on public.ad_costs (campaign_id, cost_date desc) where campaign_id is not null;

create table public.postback_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  provider public.source_kind not null,
  name text not null,
  event_name text not null,
  external_conversion_id text,
  secret_reference text,
  status public.record_status not null default 'disabled',
  send_value boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint postback_destinations_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint postback_destinations_tenant_identity unique (id, organization_id, app_id),
  constraint postback_destinations_provider check (provider in ('google_ads', 'meta_ads', 'tiktok_ads')),
  constraint postback_destinations_unique_mapping unique (app_id, provider, event_name, name)
);

create index postback_destinations_app_status_idx on public.postback_destinations (app_id, status);

create table public.postback_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  destination_id uuid not null,
  event_id uuid not null,
  idempotency_key text not null,
  status public.job_status not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint postback_jobs_destination_fk foreign key (destination_id, organization_id, app_id)
    references public.postback_destinations (id, organization_id, app_id) on delete cascade,
  constraint postback_jobs_event_fk foreign key (event_id, organization_id, app_id)
    references public.events (id, organization_id, app_id) on delete cascade,
  constraint postback_jobs_tenant_identity unique (id, organization_id, app_id),
  constraint postback_jobs_unique_idempotency unique (destination_id, idempotency_key),
  constraint postback_jobs_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint postback_jobs_attempt_count check (attempt_count >= 0)
);

create index postback_jobs_pending_idx
  on public.postback_jobs (next_attempt_at, created_at)
  where status in ('pending', 'retryable_failed');
create index postback_jobs_app_status_idx on public.postback_jobs (app_id, status, created_at desc);

create table public.postback_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  postback_job_id uuid not null,
  attempt_number integer not null,
  status public.job_status not null,
  http_status smallint,
  provider_error_code text,
  response_excerpt text,
  duration_ms integer,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint postback_attempts_job_fk foreign key (postback_job_id, organization_id, app_id)
    references public.postback_jobs (id, organization_id, app_id) on delete cascade,
  constraint postback_attempts_unique_number unique (postback_job_id, attempt_number),
  constraint postback_attempts_number check (attempt_number > 0),
  constraint postback_attempts_http_status check (http_status is null or http_status between 100 and 599),
  constraint postback_attempts_duration check (duration_ms is null or duration_ms >= 0)
);

create index postback_attempts_job_time_idx on public.postback_attempts (postback_job_id, attempted_at desc);
create index postback_attempts_org_app_idx on public.postback_attempts (organization_id, app_id);

create table public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  metric_date date not null,
  source_id uuid references public.sources (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete cascade,
  ad_group_id uuid references public.ad_groups (id) on delete cascade,
  ad_id uuid references public.ads (id) on delete cascade,
  currency text not null,
  spend_minor bigint not null default 0,
  revenue_minor bigint not null default 0,
  clicks bigint not null default 0,
  installs bigint not null default 0,
  registered_users bigint not null default 0,
  buyers bigint not null default 0,
  purchases bigint not null default 0,
  sessions bigint not null default 0,
  retained_d1 bigint not null default 0,
  retained_d7 bigint not null default 0,
  retained_d30 bigint not null default 0,
  metric_version text not null,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_metrics_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint daily_metrics_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint daily_metrics_nonnegative check (
    spend_minor >= 0 and clicks >= 0 and installs >= 0 and registered_users >= 0
    and buyers >= 0 and purchases >= 0 and sessions >= 0
    and retained_d1 >= 0 and retained_d7 >= 0 and retained_d30 >= 0
  )
);

create unique index daily_metrics_dimensions_unique_idx
  on public.daily_metrics (app_id, metric_date, source_id, campaign_id, ad_group_id, ad_id, currency, metric_version)
  nulls not distinct;
create index daily_metrics_org_app_date_idx on public.daily_metrics (organization_id, app_id, metric_date desc);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  app_id uuid,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_kind text not null,
  action text not null,
  target_table text not null,
  target_id uuid,
  before_state jsonb,
  after_state jsonb,
  request_id uuid,
  created_at timestamptz not null default now(),
  constraint audit_log_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint audit_log_actor_kind check (actor_kind in ('user', 'service', 'system')),
  constraint audit_log_before_object check (before_state is null or jsonb_typeof(before_state) = 'object'),
  constraint audit_log_after_object check (after_state is null or jsonb_typeof(after_state) = 'object')
);

create index audit_log_org_created_idx on public.audit_log (organization_id, created_at desc);
create index audit_log_app_created_idx on public.audit_log (app_id, created_at desc) where app_id is not null;

comment on table public.link_clicks is
  'High-volume table. Partition monthly by clicked_at after sustained volume exceeds 100M rows; retain raw clicks 25 months and detach/drop expired partitions.';
comment on table public.events is
  'High-volume table. Partition monthly by occurred_at after sustained volume exceeds 100M rows; keep PK/idempotency routing in the ingest service and retain raw events according to organization policy.';
comment on table public.postback_attempts is
  'Operational history. Partition monthly by attempted_at when volume warrants it; retain detailed response excerpts for 90 days and aggregate status counts before removal.';

create or replace function private.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_members member
      where member.organization_id = target_organization_id
        and member.user_id = (select auth.uid())
    );
$$;

create or replace function private.has_organization_role(
  target_organization_id uuid,
  allowed_roles public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_members member
      where member.organization_id = target_organization_id
        and member.user_id = (select auth.uid())
        and member.role = any (allowed_roles)
    );
$$;

create or replace function private.validate_marketing_hierarchy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_source_id uuid;
  linked_campaign_id uuid;
  linked_ad_group_id uuid;
  linked_organization_id uuid;
  linked_app_id uuid;
begin
  if new.source_id is not null then
    select source.organization_id, source.app_id
      into linked_organization_id, linked_app_id
    from public.sources source
    where source.id = new.source_id;
    if not found or linked_organization_id <> new.organization_id or linked_app_id <> new.app_id then
      raise exception using errcode = '23514', message = 'source does not belong to the row tenant';
    end if;
  end if;

  if new.campaign_id is not null then
    select campaign.source_id, campaign.organization_id, campaign.app_id
      into linked_source_id, linked_organization_id, linked_app_id
    from public.campaigns campaign
    where campaign.id = new.campaign_id;
    if not found or linked_organization_id <> new.organization_id or linked_app_id <> new.app_id
      or (new.source_id is not null and linked_source_id <> new.source_id) then
      raise exception using errcode = '23514', message = 'campaign does not match the row hierarchy';
    end if;
  end if;

  if new.ad_group_id is not null then
    select ad_group.source_id, ad_group.campaign_id, ad_group.organization_id, ad_group.app_id
      into linked_source_id, linked_campaign_id, linked_organization_id, linked_app_id
    from public.ad_groups ad_group
    where ad_group.id = new.ad_group_id;
    if not found or linked_organization_id <> new.organization_id or linked_app_id <> new.app_id
      or (new.source_id is not null and linked_source_id <> new.source_id)
      or (new.campaign_id is not null and linked_campaign_id <> new.campaign_id) then
      raise exception using errcode = '23514', message = 'ad group does not match the row hierarchy';
    end if;
  end if;

  if new.ad_id is not null then
    select ad.source_id, ad.campaign_id, ad.ad_group_id, ad.organization_id, ad.app_id
      into linked_source_id, linked_campaign_id, linked_ad_group_id, linked_organization_id, linked_app_id
    from public.ads ad
    where ad.id = new.ad_id;
    if not found or linked_organization_id <> new.organization_id or linked_app_id <> new.app_id
      or (new.source_id is not null and linked_source_id <> new.source_id)
      or (new.campaign_id is not null and linked_campaign_id <> new.campaign_id)
      or (new.ad_group_id is not null and linked_ad_group_id <> new.ad_group_id) then
      raise exception using errcode = '23514', message = 'ad does not match the row hierarchy';
    end if;
  end if;

  return new;
end;
$$;

create trigger smart_links_validate_hierarchy
before insert or update of organization_id, app_id, source_id, campaign_id, ad_group_id, ad_id
on public.smart_links for each row execute function private.validate_marketing_hierarchy();
create trigger attribution_candidates_validate_hierarchy
before insert or update of organization_id, app_id, source_id, campaign_id, ad_group_id, ad_id
on public.attribution_candidates for each row execute function private.validate_marketing_hierarchy();
create trigger attributions_validate_hierarchy
before insert or update of organization_id, app_id, source_id, campaign_id, ad_group_id, ad_id
on public.attributions for each row execute function private.validate_marketing_hierarchy();
create trigger ad_costs_validate_hierarchy
before insert or update of organization_id, app_id, source_id, campaign_id, ad_group_id, ad_id
on public.ad_costs for each row execute function private.validate_marketing_hierarchy();
create trigger daily_metrics_validate_hierarchy
before insert or update of organization_id, app_id, source_id, campaign_id, ad_group_id, ad_id
on public.daily_metrics for each row execute function private.validate_marketing_hierarchy();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'organizations', 'organization_members', 'apps', 'app_platforms',
    'public_sdk_keys', 'sources', 'campaigns', 'ad_groups', 'ads', 'smart_links',
    'link_destinations', 'installations', 'identities', 'attributions', 'sessions',
    'purchases', 'subscriptions', 'connector_accounts', 'connector_sync_runs',
    'ad_costs', 'postback_destinations', 'postback_jobs', 'daily_metrics'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.claim_postback_jobs(worker_id text, batch_size integer default 50)
returns setof public.postback_jobs
language sql
security invoker
set search_path = ''
as $$
  with claimable as (
    select job.id
    from public.postback_jobs job
    where job.status in ('pending', 'retryable_failed')
      and job.next_attempt_at <= now()
    order by job.next_attempt_at, job.created_at
    limit greatest(1, least(batch_size, 500))
    for update skip locked
  )
  update public.postback_jobs job
  set status = 'processing',
      locked_at = now(),
      locked_by = worker_id,
      updated_at = now()
  from claimable
  where job.id = claimable.id
  returning job.*;
$$;

revoke all on function public.claim_postback_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.claim_postback_jobs(text, integer) to service_role;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_organization_member(uuid) to authenticated;
grant execute on function private.has_organization_role(uuid, public.organization_role[]) to authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;

grant select, insert, update on public.profiles to authenticated;
grant select on table
  public.organizations,
  public.organization_members,
  public.apps,
  public.app_platforms,
  public.public_sdk_keys,
  public.sources,
  public.campaigns,
  public.ad_groups,
  public.ads,
  public.smart_links,
  public.link_destinations,
  public.link_clicks,
  public.installations,
  public.identities,
  public.attribution_candidates,
  public.attributions,
  public.events,
  public.sessions,
  public.purchases,
  public.subscriptions,
  public.connector_accounts,
  public.connector_sync_runs,
  public.ad_costs,
  public.postback_destinations,
  public.postback_jobs,
  public.postback_attempts,
  public.daily_metrics,
  public.audit_log
to authenticated;

grant insert, update, delete on table
  public.apps,
  public.app_platforms,
  public.public_sdk_keys,
  public.sources,
  public.campaigns,
  public.ad_groups,
  public.ads,
  public.smart_links,
  public.link_destinations,
  public.connector_accounts,
  public.postback_destinations
to authenticated;
grant insert, update, delete on public.organization_members to authenticated;
grant insert, update, delete on public.organizations to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'organizations', 'organization_members', 'apps', 'app_platforms',
    'public_sdk_keys', 'sources', 'campaigns', 'ad_groups', 'ads', 'smart_links',
    'link_destinations', 'link_clicks', 'installations', 'identities',
    'attribution_candidates', 'attributions', 'events', 'sessions', 'purchases',
    'subscriptions', 'connector_accounts', 'connector_sync_runs', 'ad_costs',
    'postback_destinations', 'postback_jobs', 'postback_attempts', 'daily_metrics',
    'audit_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

create policy profiles_read_self on public.profiles
for select to authenticated
using ((select auth.uid()) = id);
create policy profiles_insert_self on public.profiles
for insert to authenticated
with check ((select auth.uid()) = id);
create policy profiles_update_self on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy organizations_member_read on public.organizations
for select to authenticated
using (
  (select private.is_organization_member(id))
  or created_by = (select auth.uid())
);
create policy organizations_create_self on public.organizations
for insert to authenticated
with check (created_by = (select auth.uid()));
create policy organizations_admin_update on public.organizations
for update to authenticated
using ((select private.has_organization_role(id, array['owner', 'admin']::public.organization_role[])))
with check ((select private.has_organization_role(id, array['owner', 'admin']::public.organization_role[])));
create policy organizations_owner_delete on public.organizations
for delete to authenticated
using ((select private.has_organization_role(id, array['owner']::public.organization_role[])));

create policy organization_members_member_read on public.organization_members
for select to authenticated
using ((select private.is_organization_member(organization_id)));
create policy organization_members_admin_insert on public.organization_members
for insert to authenticated
with check (
  (select private.has_organization_role(organization_id, array['owner', 'admin']::public.organization_role[]))
  or (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1 from public.organizations organization
      where organization.id = organization_id
        and organization.created_by = (select auth.uid())
    )
  )
);
create policy organization_members_admin_update on public.organization_members
for update to authenticated
using ((select private.has_organization_role(organization_id, array['owner', 'admin']::public.organization_role[])))
with check ((select private.has_organization_role(organization_id, array['owner', 'admin']::public.organization_role[])));
create policy organization_members_admin_delete on public.organization_members
for delete to authenticated
using ((select private.has_organization_role(organization_id, array['owner', 'admin']::public.organization_role[])));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'apps', 'app_platforms', 'public_sdk_keys', 'sources', 'campaigns', 'ad_groups',
    'ads', 'smart_links', 'link_destinations', 'link_clicks', 'installations',
    'identities', 'attribution_candidates', 'attributions', 'events', 'sessions',
    'purchases', 'subscriptions', 'connector_accounts', 'connector_sync_runs',
    'ad_costs', 'postback_destinations', 'postback_jobs', 'postback_attempts',
    'daily_metrics', 'audit_log'
  ]
  loop
    execute format(
      'create policy tenant_members_can_read on public.%I for select to authenticated using ((select private.is_organization_member(organization_id)))',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'apps', 'app_platforms', 'public_sdk_keys', 'sources', 'campaigns', 'ad_groups',
    'ads', 'smart_links', 'link_destinations', 'connector_accounts', 'postback_destinations'
  ]
  loop
    execute format(
      'create policy tenant_admins_can_insert on public.%I for insert to authenticated with check ((select private.has_organization_role(organization_id, array[''owner'', ''admin'']::public.organization_role[])))',
      table_name
    );
    execute format(
      'create policy tenant_admins_can_update on public.%I for update to authenticated using ((select private.has_organization_role(organization_id, array[''owner'', ''admin'']::public.organization_role[]))) with check ((select private.has_organization_role(organization_id, array[''owner'', ''admin'']::public.organization_role[])))',
      table_name
    );
    execute format(
      'create policy tenant_admins_can_delete on public.%I for delete to authenticated using ((select private.has_organization_role(organization_id, array[''owner'', ''admin'']::public.organization_role[])))',
      table_name
    );
  end loop;
end;
$$;

comment on function private.is_organization_member(uuid) is
  'SECURITY DEFINER is required solely to avoid recursive RLS on organization_members. It checks auth.uid(), has a fixed empty search_path, lives outside exposed schemas, and exposes only a boolean.';
comment on function private.has_organization_role(uuid, public.organization_role[]) is
  'SECURITY DEFINER is required solely for indexed membership lookup inside RLS. It checks auth.uid(), has a fixed empty search_path, and returns no membership data.';
