-- Reliable post-install activity, identity, session and revenue model.
-- The SDK-facing tables remain as an immutable transport log. Derived tables can
-- be rebuilt deterministically when late events arrive.

alter table public.apps
  add column session_timeout_minutes smallint not null default 30,
  add constraint apps_session_timeout_range check (session_timeout_minutes between 5 and 1440);

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  canonical_user_hash bytea,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  identified_at timestamptz,
  merged_into_id uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint app_users_tenant_identity unique (id, organization_id, app_id),
  constraint app_users_seen_order check (last_seen_at >= first_seen_at),
  constraint app_users_identified_hash check (identified_at is null or canonical_user_hash is not null),
  constraint app_users_merge_shape check (
    merged_into_id is null or (canonical_user_hash is null and deleted_at is not null)
  )
);

alter table public.app_users
  add constraint app_users_merged_into_fk foreign key (merged_into_id, organization_id, app_id)
    references public.app_users (id, organization_id, app_id) on delete restrict;

create unique index app_users_canonical_identity_idx
  on public.app_users (app_id, canonical_user_hash)
  where canonical_user_hash is not null and deleted_at is null;
create index app_users_app_activity_idx
  on public.app_users (app_id, last_seen_at desc, id);

create table public.app_user_installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  app_user_id uuid not null,
  installation_id uuid not null,
  linked_at timestamptz not null,
  link_reason text not null default 'anonymous_installation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_user_installations_user_fk foreign key (app_user_id, organization_id, app_id)
    references public.app_users (id, organization_id, app_id) on delete cascade,
  constraint app_user_installations_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete cascade,
  constraint app_user_installations_unique_installation unique (app_id, installation_id),
  constraint app_user_installations_tenant_identity unique (id, organization_id, app_id),
  constraint app_user_installations_reason check (
    link_reason in ('anonymous_installation', 'identify', 'known_user_reinstall', 'manual_correction')
  )
);

create index app_user_installations_user_idx
  on public.app_user_installations (app_user_id, linked_at desc);

alter table public.identities add column app_user_id uuid;

insert into public.app_users (
  id, organization_id, app_id, first_seen_at, last_seen_at
)
select id, organization_id, app_id, first_open_at, last_seen_at
from public.installations
on conflict (id) do nothing;

insert into public.app_user_installations (
  organization_id, app_id, app_user_id, installation_id, linked_at
)
select organization_id, app_id, id, id, first_open_at
from public.installations
on conflict (app_id, installation_id) do nothing;

update public.identities identity_row
set app_user_id = link.app_user_id
from public.app_user_installations link
where link.app_id = identity_row.app_id
  and link.installation_id = identity_row.installation_id
  and identity_row.app_user_id is null;

alter table public.identities
  alter column app_user_id set not null,
  add constraint identities_app_user_fk foreign key (app_user_id, organization_id, app_id)
    references public.app_users (id, organization_id, app_id) on delete cascade;
create index identities_app_user_validity_idx
  on public.identities (app_user_id, valid_from desc);

alter table public.attributions
  add constraint attributions_tenant_identity unique (id, organization_id, app_id);

create table public.activity_sessions (
  id uuid primary key,
  organization_id uuid not null,
  app_id uuid not null,
  app_user_id uuid not null,
  installation_id uuid not null,
  session_key text not null,
  started_at timestamptz not null,
  last_activity_at timestamptz not null,
  event_count integer not null,
  timeout_minutes smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_sessions_user_fk foreign key (app_user_id, organization_id, app_id)
    references public.app_users (id, organization_id, app_id) on delete cascade,
  constraint activity_sessions_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete cascade,
  constraint activity_sessions_unique_key unique (app_id, installation_id, session_key),
  constraint activity_sessions_tenant_identity unique (id, organization_id, app_id),
  constraint activity_sessions_time_order check (last_activity_at >= started_at),
  constraint activity_sessions_event_count check (event_count > 0),
  constraint activity_sessions_timeout check (timeout_minutes between 5 and 1440)
);

create index activity_sessions_installation_time_idx
  on public.activity_sessions (installation_id, started_at desc);
create index activity_sessions_user_time_idx
  on public.activity_sessions (app_user_id, started_at desc);

alter table public.events
  add column app_user_id uuid,
  add column activity_session_id uuid,
  add column attribution_id uuid,
  add column attribution_scope public.attribution_scope,
  add column attribution_rule_version text,
  add column attribution_source_name text,
  add column attribution_campaign_name text,
  add column attribution_ad_group_name text,
  add column attribution_ad_name text,
  add column activity_processed_at timestamptz;

update public.events event_row
set app_user_id = link.app_user_id
from public.app_user_installations link
where link.app_id = event_row.app_id
  and link.installation_id = event_row.installation_id;

alter table public.events
  alter column app_user_id set not null,
  add constraint events_app_user_fk foreign key (app_user_id, organization_id, app_id)
    references public.app_users (id, organization_id, app_id) on delete restrict,
  add constraint events_activity_session_fk foreign key (activity_session_id, organization_id, app_id)
    references public.activity_sessions (id, organization_id, app_id) on delete set null (activity_session_id),
  add constraint events_attribution_fk foreign key (attribution_id, organization_id, app_id)
    references public.attributions (id, organization_id, app_id) on delete set null (attribution_id),
  add constraint events_attribution_snapshot_shape check (
    (attribution_id is null and attribution_scope is null and attribution_rule_version is null)
    or (attribution_id is not null and attribution_scope is not null and attribution_rule_version is not null)
  );

create index events_app_user_time_idx on public.events (app_user_id, occurred_at desc, id);
create index events_activity_session_idx on public.events (activity_session_id, occurred_at, id);
create index events_attribution_idx on public.events (attribution_id) where attribution_id is not null;

create table public.revenue_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  app_user_id uuid not null,
  installation_id uuid not null,
  event_id uuid not null,
  attribution_id uuid,
  event_type text not null,
  transaction_id text not null,
  original_transaction_id text,
  order_id text,
  product_id text,
  subscription_id text,
  products jsonb not null default '[]'::jsonb,
  quantity integer not null default 1,
  revenue_reported_minor bigint not null,
  revenue_verified_minor bigint,
  currency text not null,
  validation_status text not null default 'reported',
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint revenue_ledger_user_fk foreign key (app_user_id, organization_id, app_id)
    references public.app_users (id, organization_id, app_id) on delete restrict,
  constraint revenue_ledger_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete restrict,
  constraint revenue_ledger_event_fk foreign key (event_id, organization_id, app_id)
    references public.events (id, organization_id, app_id) on delete restrict,
  constraint revenue_ledger_attribution_fk foreign key (attribution_id, organization_id, app_id)
    references public.attributions (id, organization_id, app_id) on delete set null (attribution_id),
  constraint revenue_ledger_tenant_identity unique (id, organization_id, app_id),
  constraint revenue_ledger_unique_transaction_type unique (app_id, transaction_id, event_type),
  constraint revenue_ledger_unique_event unique (app_id, event_id),
  constraint revenue_ledger_event_type check (
    event_type in ('purchase', 'refund', 'subscription_started', 'subscription_renewed', 'subscription_refunded')
  ),
  constraint revenue_ledger_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint revenue_ledger_quantity check (quantity between 1 and 1000),
  constraint revenue_ledger_products_array check (jsonb_typeof(products) = 'array'),
  constraint revenue_ledger_refund_sign check (
    (event_type in ('refund', 'subscription_refunded') and revenue_reported_minor < 0)
    or (event_type not in ('refund', 'subscription_refunded') and revenue_reported_minor >= 0)
  ),
  constraint revenue_ledger_verified_sign check (
    revenue_verified_minor is null
    or (event_type in ('refund', 'subscription_refunded') and revenue_verified_minor <= 0)
    or (event_type not in ('refund', 'subscription_refunded') and revenue_verified_minor >= 0)
  ),
  constraint revenue_ledger_validation_status check (
    validation_status in ('reported', 'pending', 'verified', 'rejected')
  ),
  constraint revenue_ledger_verified_shape check (
    (validation_status = 'verified' and revenue_verified_minor is not null)
    or validation_status <> 'verified'
  )
);

create index revenue_ledger_app_time_idx on public.revenue_ledger (app_id, occurred_at desc, id);
create index revenue_ledger_user_time_idx on public.revenue_ledger (app_user_id, occurred_at desc);
create index revenue_ledger_installation_time_idx on public.revenue_ledger (installation_id, occurred_at desc);
create index revenue_ledger_subscription_idx
  on public.revenue_ledger (app_id, subscription_id, occurred_at desc)
  where subscription_id is not null;

create table public.revenue_validations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  revenue_entry_id uuid not null,
  provider text not null,
  status text not null default 'pending',
  provider_reference_hash bytea,
  verified_value_minor bigint,
  verified_currency text,
  evidence_summary jsonb not null default '{}'::jsonb,
  attempted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint revenue_validations_entry_fk foreign key (revenue_entry_id, organization_id, app_id)
    references public.revenue_ledger (id, organization_id, app_id) on delete cascade,
  constraint revenue_validations_tenant_identity unique (id, organization_id, app_id),
  constraint revenue_validations_unique_provider unique (revenue_entry_id, provider),
  constraint revenue_validations_provider check (provider in ('app_store', 'google_play', 'revenuecat')),
  constraint revenue_validations_status check (status in ('pending', 'verified', 'rejected', 'error')),
  constraint revenue_validations_currency check (
    verified_currency is null or verified_currency ~ '^[A-Z]{3}$'
  ),
  constraint revenue_validations_evidence_object check (jsonb_typeof(evidence_summary) = 'object')
);

create index revenue_validations_pending_idx
  on public.revenue_validations (provider, created_at)
  where status in ('pending', 'error');

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  app_user_id uuid not null,
  installation_id uuid not null,
  event_id uuid not null,
  subscription_id text not null,
  product_id text not null,
  event_type text not null,
  transaction_id text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint subscription_events_user_fk foreign key (app_user_id, organization_id, app_id)
    references public.app_users (id, organization_id, app_id) on delete restrict,
  constraint subscription_events_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete restrict,
  constraint subscription_events_event_fk foreign key (event_id, organization_id, app_id)
    references public.events (id, organization_id, app_id) on delete restrict,
  constraint subscription_events_unique_event unique (app_id, event_id),
  constraint subscription_events_tenant_identity unique (id, organization_id, app_id),
  constraint subscription_events_type check (
    event_type in ('subscription_started', 'subscription_renewed', 'subscription_cancelled', 'subscription_expired', 'subscription_refunded')
  )
);

create index subscription_events_history_idx
  on public.subscription_events (app_id, subscription_id, occurred_at desc, event_id desc);

alter table public.subscriptions
  add column app_user_id uuid,
  add column lifecycle_status text not null default 'active',
  add column revenue_reported_minor bigint not null default 0,
  add column revenue_verified_minor bigint not null default 0,
  add column validation_status text not null default 'reported',
  add column last_event_at timestamptz,
  add column expired_at timestamptz,
  add column refunded_at timestamptz;

update public.subscriptions subscription
set app_user_id = link.app_user_id,
    revenue_reported_minor = subscription.revenue_minor,
    lifecycle_status = subscription.status::text,
    last_event_at = coalesce(subscription.cancelled_at, subscription.current_period_started_at)
from public.app_user_installations link
where link.app_id = subscription.app_id
  and link.installation_id = subscription.installation_id;

alter table public.subscriptions
  alter column app_user_id set not null,
  add constraint subscriptions_app_user_fk foreign key (app_user_id, organization_id, app_id)
    references public.app_users (id, organization_id, app_id) on delete restrict,
  add constraint subscriptions_lifecycle_status check (
    lifecycle_status in ('trialing', 'active', 'past_due', 'cancelled', 'expired', 'refunded')
  ),
  add constraint subscriptions_validation_status check (
    validation_status in ('reported', 'pending', 'verified', 'rejected')
  );
create index subscriptions_app_user_idx on public.subscriptions (app_user_id, updated_at desc);

create table public.push_token_invalidations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  installation_id uuid not null,
  provider text not null,
  token_hash bytea not null,
  first_invalid_at timestamptz not null,
  last_invalid_at timestamptz not null,
  invalid_count integer not null default 1,
  last_error_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_token_invalidations_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete cascade,
  constraint push_token_invalidations_unique_token unique (app_id, provider, token_hash),
  constraint push_token_invalidations_tenant_identity unique (id, organization_id, app_id),
  constraint push_token_invalidations_provider check (provider in ('apns', 'fcm')),
  constraint push_token_invalidations_count check (invalid_count > 0),
  constraint push_token_invalidations_time_order check (last_invalid_at >= first_invalid_at)
);

create table public.uninstall_inferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  installation_id uuid not null,
  inferred_at timestamptz not null,
  evidence jsonb not null,
  confidence numeric(5,4) not null,
  signal_type text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uninstall_inferences_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete cascade,
  constraint uninstall_inferences_unique_active unique nulls not distinct (app_id, installation_id, status),
  constraint uninstall_inferences_tenant_identity unique (id, organization_id, app_id),
  constraint uninstall_inferences_evidence_object check (jsonb_typeof(evidence) = 'object'),
  constraint uninstall_inferences_confidence check (confidence between 0 and 1),
  constraint uninstall_inferences_signal check (signal_type = 'persistent_push_token_invalidation'),
  constraint uninstall_inferences_status check (status in ('active', 'retracted'))
);

create index uninstall_inferences_app_time_idx on public.uninstall_inferences (app_id, inferred_at desc);

create table public.installation_activity_metrics (
  installation_id uuid primary key,
  organization_id uuid not null,
  app_id uuid not null,
  app_user_id uuid not null,
  session_count integer not null default 0,
  first_activity_at timestamptz,
  last_activity_at timestamptz,
  signed_up_at timestamptz,
  first_purchase_at timestamptz,
  revenue_reported_by_currency jsonb not null default '{}'::jsonb,
  revenue_verified_by_currency jsonb not null default '{}'::jsonb,
  ltv_observed_minor bigint not null default 0,
  ltv_currency text not null,
  payer_status text not null default 'never_paid',
  updated_at timestamptz not null default now(),
  constraint installation_activity_metrics_installation_fk foreign key (installation_id, organization_id, app_id)
    references public.installations (id, organization_id, app_id) on delete cascade,
  constraint installation_activity_metrics_user_fk foreign key (app_user_id, organization_id, app_id)
    references public.app_users (id, organization_id, app_id) on delete cascade,
  constraint installation_activity_metrics_currency check (ltv_currency ~ '^[A-Z]{3}$'),
  constraint installation_activity_metrics_payer check (
    payer_status in ('never_paid', 'reported', 'verified', 'refunded')
  ),
  constraint installation_activity_metrics_reported_object check (jsonb_typeof(revenue_reported_by_currency) = 'object'),
  constraint installation_activity_metrics_verified_object check (jsonb_typeof(revenue_verified_by_currency) = 'object')
);

create index installation_activity_metrics_app_activity_idx
  on public.installation_activity_metrics (app_id, last_activity_at desc, installation_id);

create table public.app_user_metrics (
  app_user_id uuid primary key,
  organization_id uuid not null,
  app_id uuid not null,
  installation_count integer not null default 0,
  session_count integer not null default 0,
  first_install_at timestamptz,
  first_activity_at timestamptz,
  last_activity_at timestamptz,
  signed_up_at timestamptz,
  first_purchase_at timestamptz,
  revenue_reported_by_currency jsonb not null default '{}'::jsonb,
  revenue_verified_by_currency jsonb not null default '{}'::jsonb,
  ltv_observed_minor bigint not null default 0,
  ltv_currency text not null,
  payer_status text not null default 'never_paid',
  updated_at timestamptz not null default now(),
  constraint app_user_metrics_user_fk foreign key (app_user_id, organization_id, app_id)
    references public.app_users (id, organization_id, app_id) on delete cascade,
  constraint app_user_metrics_currency check (ltv_currency ~ '^[A-Z]{3}$'),
  constraint app_user_metrics_payer check (
    payer_status in ('never_paid', 'reported', 'verified', 'refunded')
  ),
  constraint app_user_metrics_reported_object check (jsonb_typeof(revenue_reported_by_currency) = 'object'),
  constraint app_user_metrics_verified_object check (jsonb_typeof(revenue_verified_by_currency) = 'object')
);

create index app_user_metrics_app_activity_idx
  on public.app_user_metrics (app_id, last_activity_at desc nulls last, app_user_id);
create index app_user_metrics_app_payer_idx
  on public.app_user_metrics (app_id, payer_status, last_activity_at desc nulls last);

create or replace function private.ensure_installation_app_user(
  requested_organization_id uuid,
  requested_app_id uuid,
  requested_installation_id uuid,
  observed_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resolved_user_id uuid;
begin
  select link.app_user_id into resolved_user_id
  from public.app_user_installations link
  where link.app_id = requested_app_id
    and link.installation_id = requested_installation_id;

  if resolved_user_id is not null then
    update public.app_users
    set first_seen_at = least(first_seen_at, observed_at),
        last_seen_at = greatest(last_seen_at, observed_at),
        updated_at = statement_timestamp()
    where id = resolved_user_id;
    return resolved_user_id;
  end if;

  resolved_user_id := requested_installation_id;
  insert into public.app_users (
    id, organization_id, app_id, first_seen_at, last_seen_at
  ) values (
    resolved_user_id, requested_organization_id, requested_app_id, observed_at, observed_at
  ) on conflict (id) do update
  set first_seen_at = least(public.app_users.first_seen_at, excluded.first_seen_at),
      last_seen_at = greatest(public.app_users.last_seen_at, excluded.last_seen_at),
      updated_at = statement_timestamp();

  insert into public.app_user_installations (
    organization_id, app_id, app_user_id, installation_id, linked_at
  ) values (
    requested_organization_id, requested_app_id, resolved_user_id,
    requested_installation_id, observed_at
  ) on conflict (app_id, installation_id) do nothing;

  return resolved_user_id;
end;
$$;

create or replace function private.link_identified_user(
  requested_organization_id uuid,
  requested_app_id uuid,
  requested_installation_id uuid,
  requested_user_hash bytea,
  requested_identified_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_profile public.app_users%rowtype;
  existing_user_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(requested_app_id::text || ':' || requested_installation_id::text, 0));
  perform private.ensure_installation_app_user(
    requested_organization_id, requested_app_id, requested_installation_id, requested_identified_at
  );

  select app_user.* into current_profile
  from public.app_users app_user
  join public.app_user_installations link on link.app_user_id = app_user.id
  where link.app_id = requested_app_id
    and link.installation_id = requested_installation_id
  for update of app_user;

  if current_profile.canonical_user_hash is not null
    and current_profile.canonical_user_hash <> requested_user_hash then
    raise exception 'identity_conflict' using errcode = '23514';
  end if;

  select id into existing_user_id
  from public.app_users
  where app_id = requested_app_id
    and canonical_user_hash = requested_user_hash
    and deleted_at is null
  for update;

  if existing_user_id is null or existing_user_id = current_profile.id then
    update public.app_users
    set canonical_user_hash = requested_user_hash,
        identified_at = coalesce(public.app_users.identified_at, requested_identified_at),
        last_seen_at = greatest(last_seen_at, requested_identified_at),
        updated_at = statement_timestamp()
    where id = current_profile.id;
    return current_profile.id;
  end if;

  -- A reinstall may join a known profile only while its current profile is anonymous.
  -- Two different known identities are never merged.
  if current_profile.canonical_user_hash is not null then
    raise exception 'identity_conflict' using errcode = '23514';
  end if;

  update public.app_user_installations
  set app_user_id = existing_user_id,
      linked_at = requested_identified_at,
      link_reason = 'known_user_reinstall',
      updated_at = statement_timestamp()
  where app_id = requested_app_id
    and installation_id = requested_installation_id;

  update public.identities set app_user_id = existing_user_id
  where app_id = requested_app_id and installation_id = requested_installation_id;
  update public.events set app_user_id = existing_user_id
  where app_id = requested_app_id and installation_id = requested_installation_id;
  update public.revenue_ledger set app_user_id = existing_user_id
  where app_id = requested_app_id and installation_id = requested_installation_id;
  update public.subscription_events set app_user_id = existing_user_id
  where app_id = requested_app_id and installation_id = requested_installation_id;
  update public.subscriptions set app_user_id = existing_user_id
  where app_id = requested_app_id and installation_id = requested_installation_id;

  update public.app_users
  set first_seen_at = least(first_seen_at, current_profile.first_seen_at),
      last_seen_at = greatest(last_seen_at, current_profile.last_seen_at, requested_identified_at),
      updated_at = statement_timestamp()
  where id = existing_user_id;

  update public.app_users
  set identified_at = null,
      deleted_at = statement_timestamp(),
      merged_into_id = existing_user_id,
      updated_at = statement_timestamp()
  where id = current_profile.id;

  return existing_user_id;
end;
$$;

create or replace function private.snapshot_event_attribution(requested_installation_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  with chosen as (
    select event_row.id event_id, attribution.id attribution_id,
      attribution.scope, attribution.rule_version, attribution.source_name,
      attribution.campaign_name, attribution.ad_group_name, attribution.ad_name
    from public.events event_row
    cross join lateral (
      select candidate.*
      from public.attributions candidate
      where candidate.installation_id = event_row.installation_id
        and candidate.app_id = event_row.app_id
        and candidate.attributed_at <= event_row.occurred_at
      order by
        case when candidate.scope = 'reengagement' then 0 else 1 end,
        candidate.attributed_at desc,
        candidate.created_at desc
      limit 1
    ) attribution
    where event_row.installation_id = requested_installation_id
      and event_row.attribution_id is null
  )
  update public.events event_row
  set attribution_id = chosen.attribution_id,
      attribution_scope = chosen.scope,
      attribution_rule_version = chosen.rule_version,
      attribution_source_name = chosen.source_name,
      attribution_campaign_name = chosen.campaign_name,
      attribution_ad_group_name = chosen.ad_group_name,
      attribution_ad_name = chosen.ad_name
  from chosen
  where event_row.id = chosen.event_id;
$$;

create or replace function private.rebuild_activity_sessions(requested_installation_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  event_row public.events%rowtype;
  derived_session_id uuid;
  previous_at timestamptz;
  timeout_minutes smallint;
begin
  select app.session_timeout_minutes into timeout_minutes
  from public.installations installation
  join public.apps app on app.id = installation.app_id
  where installation.id = requested_installation_id;

  update public.events set activity_session_id = null
  where installation_id = requested_installation_id;
  delete from public.activity_sessions where installation_id = requested_installation_id;

  for event_row in
    select * from public.events
    where installation_id = requested_installation_id
    order by occurred_at, event_id
  loop
    if previous_at is null
      or event_row.occurred_at - previous_at > make_interval(mins => timeout_minutes) then
      derived_session_id := event_row.event_id;
      insert into public.activity_sessions (
        id, organization_id, app_id, app_user_id, installation_id, session_key,
        started_at, last_activity_at, event_count, timeout_minutes
      ) values (
        derived_session_id, event_row.organization_id, event_row.app_id, event_row.app_user_id,
        event_row.installation_id, event_row.event_id::text, event_row.occurred_at,
        event_row.occurred_at, 1, timeout_minutes
      );
    else
      update public.activity_sessions
      set last_activity_at = event_row.occurred_at,
          event_count = event_count + 1,
          updated_at = statement_timestamp()
      where id = derived_session_id;
    end if;

    update public.events set activity_session_id = derived_session_id
    where id = event_row.id;
    previous_at := event_row.occurred_at;
  end loop;
end;
$$;

create or replace function private.rebuild_revenue_and_subscriptions(requested_installation_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  event_row public.events%rowtype;
  event_value bigint;
  event_currency text;
  event_transaction text;
  subscription_row record;
begin
  for event_row in
    select * from public.events
    where installation_id = requested_installation_id
      and name in (
        'purchase', 'refund', 'subscription_started', 'subscription_renewed',
        'subscription_cancelled', 'subscription_expired', 'subscription_refunded'
      )
    order by occurred_at, event_id
  loop
    if event_row.name in (
      'purchase', 'refund', 'subscription_started', 'subscription_renewed', 'subscription_refunded'
    ) then
      event_transaction := nullif(event_row.properties ->> 'transactionId', '');
      event_currency := event_row.properties ->> 'currency';
      event_value := case
        when event_row.properties ->> 'valueMinor' ~ '^-?[0-9]+$'
          then (event_row.properties ->> 'valueMinor')::bigint
      end;

      if event_transaction is null or event_value is null or event_currency !~ '^[A-Z]{3}$' then
        raise exception 'invalid_revenue_event' using errcode = '22023';
      end if;
      if event_row.name in ('refund', 'subscription_refunded') and event_value >= 0 then
        raise exception 'refund_must_be_negative' using errcode = '22023';
      end if;
      if event_row.name not in ('refund', 'subscription_refunded') and event_value < 0 then
        raise exception 'revenue_must_be_nonnegative' using errcode = '22023';
      end if;

      insert into public.revenue_ledger (
        organization_id, app_id, app_user_id, installation_id, event_id, attribution_id,
        event_type, transaction_id, original_transaction_id, order_id, product_id,
        subscription_id, products, quantity, revenue_reported_minor, currency, occurred_at
      ) values (
        event_row.organization_id, event_row.app_id, event_row.app_user_id,
        event_row.installation_id, event_row.id, event_row.attribution_id, event_row.name,
        event_transaction, nullif(event_row.properties ->> 'originalTransactionId', ''),
        nullif(event_row.properties ->> 'orderId', ''),
        nullif(event_row.properties ->> 'productId', ''),
        nullif(event_row.properties ->> 'subscriptionId', ''),
        case when jsonb_typeof(event_row.properties -> 'products') = 'array'
          then event_row.properties -> 'products' else '[]'::jsonb end,
        case when event_row.properties ->> 'quantity' ~ '^[0-9]+$'
          then (event_row.properties ->> 'quantity')::integer else 1 end,
        event_value, event_currency, event_row.occurred_at
      ) on conflict (app_id, transaction_id, event_type) do nothing;
    end if;

    if event_row.name like 'subscription_%' then
      if nullif(event_row.properties ->> 'subscriptionId', '') is null
        or nullif(event_row.properties ->> 'productId', '') is null then
        raise exception 'invalid_subscription_event' using errcode = '22023';
      end if;
      insert into public.subscription_events (
        organization_id, app_id, app_user_id, installation_id, event_id,
        subscription_id, product_id, event_type, transaction_id, occurred_at
      ) values (
        event_row.organization_id, event_row.app_id, event_row.app_user_id,
        event_row.installation_id, event_row.id,
        event_row.properties ->> 'subscriptionId', event_row.properties ->> 'productId',
        event_row.name, nullif(event_row.properties ->> 'transactionId', ''), event_row.occurred_at
      ) on conflict (app_id, event_id) do nothing;
    end if;
  end loop;

  for subscription_row in
    select distinct subscription_id
    from public.subscription_events
    where installation_id = requested_installation_id
  loop
    with latest as (
      select subscription_event.*
      from public.subscription_events subscription_event
      where subscription_event.app_id = (
          select installation.app_id from public.installations installation
          where installation.id = requested_installation_id
        )
        and subscription_event.subscription_id = subscription_row.subscription_id
      order by subscription_event.occurred_at desc, subscription_event.event_id desc
      limit 1
    ), money as (
      select
        coalesce(sum(ledger.revenue_reported_minor), 0)::bigint reported,
        coalesce(sum(ledger.revenue_verified_minor), 0)::bigint verified,
        coalesce(
          (array_agg(ledger.currency order by ledger.occurred_at desc)
            filter (where ledger.currency is not null))[1],
          (select app.currency from public.apps app where app.id = (select app_id from latest))
        ) currency
      from public.revenue_ledger ledger
      where ledger.app_id = (select app_id from latest)
        and ledger.subscription_id = subscription_row.subscription_id
    )
    insert into public.subscriptions (
      organization_id, app_id, installation_id, app_user_id, external_subscription_id,
      product_id, platform, status, lifecycle_status, current_period_started_at,
      cancelled_at, expired_at, refunded_at, revenue_minor, revenue_reported_minor,
      revenue_verified_minor, validation_status, currency, last_event_at
    )
    select
      latest.organization_id, latest.app_id, latest.installation_id, latest.app_user_id,
      latest.subscription_id, latest.product_id, installation.platform,
      case latest.event_type
        when 'subscription_expired' then 'expired'::public.subscription_status
        when 'subscription_cancelled' then 'cancelled'::public.subscription_status
        when 'subscription_refunded' then 'cancelled'::public.subscription_status
        else 'active'::public.subscription_status
      end,
      case latest.event_type
        when 'subscription_cancelled' then 'cancelled'
        when 'subscription_expired' then 'expired'
        when 'subscription_refunded' then 'refunded'
        else 'active'
      end,
      coalesce(
        (select min(occurred_at) from public.subscription_events started
          where started.app_id = latest.app_id
            and started.subscription_id = latest.subscription_id
            and started.event_type = 'subscription_started'),
        latest.occurred_at
      ),
      case when latest.event_type = 'subscription_cancelled' then latest.occurred_at end,
      case when latest.event_type = 'subscription_expired' then latest.occurred_at end,
      case when latest.event_type = 'subscription_refunded' then latest.occurred_at end,
      money.reported, money.reported, money.verified,
      case when exists (
        select 1 from public.revenue_ledger validation
        where validation.app_id = latest.app_id
          and validation.subscription_id = latest.subscription_id
          and validation.validation_status = 'pending'
      ) then 'pending' else 'reported' end,
      money.currency, latest.occurred_at
    from latest
    join public.installations installation on installation.id = latest.installation_id
    cross join money
    on conflict (app_id, external_subscription_id) do update
    set installation_id = excluded.installation_id,
        app_user_id = excluded.app_user_id,
        product_id = excluded.product_id,
        platform = excluded.platform,
        status = excluded.status,
        lifecycle_status = excluded.lifecycle_status,
        current_period_started_at = excluded.current_period_started_at,
        cancelled_at = excluded.cancelled_at,
        expired_at = excluded.expired_at,
        refunded_at = excluded.refunded_at,
        revenue_minor = excluded.revenue_minor,
        revenue_reported_minor = excluded.revenue_reported_minor,
        revenue_verified_minor = excluded.revenue_verified_minor,
        validation_status = excluded.validation_status,
        currency = excluded.currency,
        last_event_at = excluded.last_event_at,
        updated_at = statement_timestamp();
  end loop;
end;
$$;

create or replace function private.rebuild_activity_metrics(requested_installation_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resolved_user_id uuid;
  app_currency text;
begin
  select link.app_user_id, app.currency into resolved_user_id, app_currency
  from public.app_user_installations link
  join public.apps app on app.id = link.app_id
  where link.installation_id = requested_installation_id;

  insert into public.installation_activity_metrics (
    installation_id, organization_id, app_id, app_user_id, session_count,
    first_activity_at, last_activity_at, signed_up_at, first_purchase_at,
    revenue_reported_by_currency, revenue_verified_by_currency,
    ltv_observed_minor, ltv_currency, payer_status
  )
  select
    installation.id, installation.organization_id, installation.app_id, resolved_user_id,
    (select count(*)::integer from public.activity_sessions activity_session
      where activity_session.installation_id = installation.id),
    (select min(occurred_at) from public.events event_row where event_row.installation_id = installation.id),
    (select max(occurred_at) from public.events event_row where event_row.installation_id = installation.id),
    (select min(occurred_at) from public.events event_row
      where event_row.installation_id = installation.id and event_row.name = 'sign_up'),
    (select min(occurred_at) from public.revenue_ledger ledger
      where ledger.installation_id = installation.id
        and ledger.event_type in ('purchase', 'subscription_started', 'subscription_renewed')
        and ledger.revenue_reported_minor > 0),
    coalesce((select jsonb_object_agg(currency, amount::text) from (
      select currency, sum(revenue_reported_minor)::bigint amount
      from public.revenue_ledger ledger where ledger.installation_id = installation.id group by currency
    ) reported), '{}'::jsonb),
    coalesce((select jsonb_object_agg(currency, amount::text) from (
      select currency, sum(revenue_verified_minor)::bigint amount
      from public.revenue_ledger ledger
      where ledger.installation_id = installation.id and revenue_verified_minor is not null
      group by currency
    ) verified), '{}'::jsonb),
    coalesce((select sum(revenue_reported_minor)::bigint from public.revenue_ledger ledger
      where ledger.installation_id = installation.id and ledger.currency = app_currency), 0),
    app_currency,
    case
      when exists (select 1 from public.revenue_ledger ledger
        where ledger.installation_id = installation.id and ledger.validation_status = 'verified'
          and ledger.revenue_verified_minor > 0) then 'verified'
      when coalesce((select sum(revenue_reported_minor) from public.revenue_ledger ledger
        where ledger.installation_id = installation.id), 0) > 0 then 'reported'
      when exists (select 1 from public.revenue_ledger ledger
        where ledger.installation_id = installation.id and ledger.revenue_reported_minor < 0) then 'refunded'
      else 'never_paid'
    end
  from public.installations installation
  where installation.id = requested_installation_id
  on conflict (installation_id) do update
  set app_user_id = excluded.app_user_id,
      session_count = excluded.session_count,
      first_activity_at = excluded.first_activity_at,
      last_activity_at = excluded.last_activity_at,
      signed_up_at = excluded.signed_up_at,
      first_purchase_at = excluded.first_purchase_at,
      revenue_reported_by_currency = excluded.revenue_reported_by_currency,
      revenue_verified_by_currency = excluded.revenue_verified_by_currency,
      ltv_observed_minor = excluded.ltv_observed_minor,
      ltv_currency = excluded.ltv_currency,
      payer_status = excluded.payer_status,
      updated_at = statement_timestamp();

  insert into public.app_user_metrics (
    app_user_id, organization_id, app_id, installation_count, session_count,
    first_install_at, first_activity_at, last_activity_at, signed_up_at, first_purchase_at,
    revenue_reported_by_currency, revenue_verified_by_currency,
    ltv_observed_minor, ltv_currency, payer_status
  )
  select
    app_user.id, app_user.organization_id, app_user.app_id,
    count(distinct link.installation_id)::integer,
    coalesce(sum(metric.session_count), 0)::integer,
    min(installation.first_open_at), min(metric.first_activity_at), max(metric.last_activity_at),
    min(metric.signed_up_at), min(metric.first_purchase_at),
    coalesce((select jsonb_object_agg(currency, amount::text) from (
      select ledger.currency, sum(ledger.revenue_reported_minor)::bigint amount
      from public.revenue_ledger ledger where ledger.app_user_id = app_user.id group by ledger.currency
    ) reported), '{}'::jsonb),
    coalesce((select jsonb_object_agg(currency, amount::text) from (
      select ledger.currency, sum(ledger.revenue_verified_minor)::bigint amount
      from public.revenue_ledger ledger
      where ledger.app_user_id = app_user.id and ledger.revenue_verified_minor is not null
      group by ledger.currency
    ) verified), '{}'::jsonb),
    coalesce((select sum(ledger.revenue_reported_minor)::bigint from public.revenue_ledger ledger
      where ledger.app_user_id = app_user.id and ledger.currency = app_currency), 0),
    app_currency,
    case
      when exists (select 1 from public.revenue_ledger ledger
        where ledger.app_user_id = app_user.id and ledger.validation_status = 'verified'
          and ledger.revenue_verified_minor > 0) then 'verified'
      when coalesce((select sum(ledger.revenue_reported_minor) from public.revenue_ledger ledger
        where ledger.app_user_id = app_user.id), 0) > 0 then 'reported'
      when exists (select 1 from public.revenue_ledger ledger
        where ledger.app_user_id = app_user.id and ledger.revenue_reported_minor < 0) then 'refunded'
      else 'never_paid'
    end
  from public.app_users app_user
  join public.app_user_installations link on link.app_user_id = app_user.id
  join public.installations installation on installation.id = link.installation_id
  left join public.installation_activity_metrics metric on metric.installation_id = installation.id
  where app_user.id = resolved_user_id
  group by app_user.id
  on conflict (app_user_id) do update
  set installation_count = excluded.installation_count,
      session_count = excluded.session_count,
      first_install_at = excluded.first_install_at,
      first_activity_at = excluded.first_activity_at,
      last_activity_at = excluded.last_activity_at,
      signed_up_at = excluded.signed_up_at,
      first_purchase_at = excluded.first_purchase_at,
      revenue_reported_by_currency = excluded.revenue_reported_by_currency,
      revenue_verified_by_currency = excluded.revenue_verified_by_currency,
      ltv_observed_minor = excluded.ltv_observed_minor,
      ltv_currency = excluded.ltv_currency,
      payer_status = excluded.payer_status,
      updated_at = statement_timestamp();
end;
$$;

create or replace function private.process_installation_activity(requested_installation_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  installation_row public.installations%rowtype;
begin
  select * into strict installation_row from public.installations where id = requested_installation_id;
  perform private.ensure_installation_app_user(
    installation_row.organization_id, installation_row.app_id,
    installation_row.id, installation_row.first_open_at
  );
  update public.events event_row
  set app_user_id = link.app_user_id
  from public.app_user_installations link
  where link.installation_id = requested_installation_id
    and event_row.installation_id = link.installation_id
    and event_row.app_user_id <> link.app_user_id;
  perform private.snapshot_event_attribution(requested_installation_id);
  perform private.rebuild_activity_sessions(requested_installation_id);
  perform private.rebuild_revenue_and_subscriptions(requested_installation_id);
  perform private.rebuild_activity_metrics(requested_installation_id);
  update public.events set activity_processed_at = statement_timestamp()
  where installation_id = requested_installation_id;
end;
$$;

create or replace function private.assign_identity_app_user()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.app_user_id is null then
    new.app_user_id := private.ensure_installation_app_user(
      new.organization_id, new.app_id, new.installation_id, new.valid_from
    );
  end if;
  return new;
end;
$$;

create or replace function private.assign_event_app_user()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.app_user_id is null then
    new.app_user_id := private.ensure_installation_app_user(
      new.organization_id, new.app_id, new.installation_id, new.occurred_at
    );
  end if;
  return new;
end;
$$;

create trigger identities_assign_app_user
before insert on public.identities
for each row execute function private.assign_identity_app_user();
create trigger events_assign_app_user
before insert on public.events
for each row execute function private.assign_event_app_user();

create or replace function public.record_push_token_invalidation(
  requested_app_id uuid,
  requested_installation_id uuid,
  requested_provider text,
  provided_token_hash text,
  requested_error_code text,
  requested_observed_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  installation_row public.installations%rowtype;
  signal_row public.push_token_invalidations%rowtype;
  inference_id uuid;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if requested_provider not in ('apns', 'fcm')
    or provided_token_hash !~ '^[a-f0-9]{64}$'
    or char_length(requested_error_code) not between 1 and 80 then
    raise exception 'invalid_push_invalidation' using errcode = '22023';
  end if;

  select * into strict installation_row from public.installations
  where id = requested_installation_id and app_id = requested_app_id;

  insert into public.push_token_invalidations (
    organization_id, app_id, installation_id, provider, token_hash,
    first_invalid_at, last_invalid_at, invalid_count, last_error_code
  ) values (
    installation_row.organization_id, requested_app_id, requested_installation_id,
    requested_provider, decode(provided_token_hash, 'hex'), requested_observed_at,
    requested_observed_at, 1, requested_error_code
  ) on conflict (app_id, provider, token_hash) do update
  set last_invalid_at = greatest(public.push_token_invalidations.last_invalid_at, excluded.last_invalid_at),
      first_invalid_at = least(public.push_token_invalidations.first_invalid_at, excluded.first_invalid_at),
      invalid_count = public.push_token_invalidations.invalid_count + 1,
      last_error_code = excluded.last_error_code,
      updated_at = statement_timestamp()
  returning * into signal_row;

  if signal_row.invalid_count >= 2
    and signal_row.last_invalid_at - signal_row.first_invalid_at >= interval '24 hours' then
    insert into public.uninstall_inferences (
      organization_id, app_id, installation_id, inferred_at, evidence, confidence, signal_type
    ) values (
      installation_row.organization_id, requested_app_id, requested_installation_id,
      signal_row.last_invalid_at,
      jsonb_build_object(
        'provider', requested_provider,
        'invalidCount', signal_row.invalid_count,
        'firstInvalidAt', signal_row.first_invalid_at,
        'lastErrorCode', requested_error_code
      ),
      0.8500, 'persistent_push_token_invalidation'
    ) on conflict (app_id, installation_id, status) do update
    set inferred_at = greatest(public.uninstall_inferences.inferred_at, excluded.inferred_at),
        evidence = excluded.evidence,
        confidence = excluded.confidence,
        updated_at = statement_timestamp()
    returning id into inference_id;
  end if;

  return jsonb_build_object(
    'inferred', inference_id is not null,
    'inferenceId', inference_id,
    'invalidCount', signal_row.invalid_count
  );
end;
$$;

create or replace function public.erase_app_user(
  requested_app_id uuid,
  requested_app_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_organization_id uuid;
begin
  select organization_id into strict requested_organization_id
  from public.app_users
  where id = requested_app_user_id and app_id = requested_app_id;

  if (select auth.role()) <> 'service_role'
    and not (select private.has_organization_role(
      requested_organization_id,
      array['owner', 'admin']::public.organization_role[]
    )) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.identities
  set identity_hash = extensions.digest(gen_random_uuid()::text, 'sha256'),
      traits = '{}'::jsonb,
      valid_to = coalesce(valid_to, greatest(statement_timestamp(), valid_from + interval '1 microsecond')),
      updated_at = statement_timestamp()
  where app_user_id = requested_app_user_id;

  update public.app_users
  set canonical_user_hash = null,
      identified_at = null,
      deleted_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where id = requested_app_user_id;
end;
$$;

create or replace function public.ingest_sdk_messages_v3(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ingest_result jsonb;
  message jsonb;
  installation_id uuid;
  requested_app_id uuid;
  requested_organization_id uuid;
  observed_at timestamptz;
begin
  ingest_result := public.ingest_sdk_messages_v2(payload);

  for message in select value from jsonb_array_elements(payload -> 'messages') item(value)
  loop
    requested_app_id := (message ->> 'appId')::uuid;
    requested_organization_id := (message ->> 'organizationId')::uuid;
    if message ->> 'kind' in ('installation', 'identify') then
      installation_id := (message -> 'body' ->> 'installationId')::uuid;
      observed_at := (message -> 'body' ->> 'occurredAt')::timestamptz;
    else
      installation_id := ((message -> 'body' -> 'events' -> 0) ->> 'installationId')::uuid;
      observed_at := (message ->> 'receivedAt')::timestamptz;
    end if;

    perform private.ensure_installation_app_user(
      requested_organization_id, requested_app_id, installation_id, observed_at
    );

    if message ->> 'kind' = 'identify' then
      perform private.link_identified_user(
        requested_organization_id, requested_app_id, installation_id,
        extensions.digest(message -> 'body' ->> 'userId', 'sha256'), observed_at
      );
    elsif message ->> 'kind' = 'events'
      and jsonb_typeof(message -> 'body' -> 'identity') = 'object' then
      perform private.link_identified_user(
        requested_organization_id, requested_app_id, installation_id,
        extensions.digest(message -> 'body' -> 'identity' ->> 'userId', 'sha256'), observed_at
      );
    end if;

    update public.identities identity_row
    set app_user_id = link.app_user_id,
        updated_at = statement_timestamp()
    from public.app_user_installations link
    where link.app_id = requested_app_id
      and link.installation_id = installation_id
      and identity_row.app_id = requested_app_id
      and identity_row.installation_id = installation_id
      and identity_row.app_user_id <> link.app_user_id;

    perform private.process_installation_activity(installation_id);
  end loop;

  return ingest_result;
end;
$$;

create or replace function public.set_app_session_timeout(
  requested_app_id uuid,
  requested_timeout_minutes smallint
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if requested_timeout_minutes not between 5 and 1440 then
    raise exception 'invalid_session_timeout' using errcode = '22023';
  end if;
  update public.apps
  set session_timeout_minutes = requested_timeout_minutes,
      updated_at = statement_timestamp()
  where id = requested_app_id;
  if not found then
    raise exception 'app_not_found_or_forbidden' using errcode = 'P0002';
  end if;
end;
$$;

-- Rebuild existing fixtures and pre-migration activity through the same deterministic path.
do $$
declare installation_id uuid;
begin
  for installation_id in select id from public.installations loop
    perform private.process_installation_activity(installation_id);
  end loop;
end;
$$;

create trigger app_users_set_updated_at before update on public.app_users
for each row execute function private.set_updated_at();
create trigger app_user_installations_set_updated_at before update on public.app_user_installations
for each row execute function private.set_updated_at();
create trigger revenue_ledger_set_updated_at before update on public.revenue_ledger
for each row execute function private.set_updated_at();
create trigger revenue_validations_set_updated_at before update on public.revenue_validations
for each row execute function private.set_updated_at();
create trigger push_token_invalidations_set_updated_at before update on public.push_token_invalidations
for each row execute function private.set_updated_at();
create trigger uninstall_inferences_set_updated_at before update on public.uninstall_inferences
for each row execute function private.set_updated_at();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'app_users', 'app_user_installations', 'activity_sessions', 'revenue_ledger',
    'revenue_validations', 'subscription_events', 'push_token_invalidations',
    'uninstall_inferences', 'installation_activity_metrics', 'app_user_metrics'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_organization_member(organization_id)))',
      table_name || '_member_read', table_name
    );
  end loop;
end;
$$;

revoke all on function public.ingest_sdk_messages_v3(jsonb) from public, anon, authenticated;
revoke all on function public.record_push_token_invalidation(uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.erase_app_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_app_session_timeout(uuid, smallint) from public, anon, authenticated;
grant execute on function public.ingest_sdk_messages_v3(jsonb) to service_role;
grant execute on function public.record_push_token_invalidation(uuid, uuid, text, text, text, timestamptz)
  to service_role;
grant execute on function public.erase_app_user(uuid, uuid) to service_role, authenticated;
grant execute on function public.set_app_session_timeout(uuid, smallint) to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_organization_member(uuid) to authenticated;
grant execute on function private.has_organization_role(uuid, public.organization_role[]) to authenticated;
grant execute on function private.create_default_attribution_rule_set() to service_role;
grant execute on function private.evaluate_attribution(
  uuid, uuid, public.attribution_scope, uuid, timestamptz, jsonb, text
) to service_role;
grant execute on function private.persist_sdk_messages_base(jsonb) to service_role;
grant execute on function private.ensure_installation_app_user(uuid, uuid, uuid, timestamptz) to service_role;
grant execute on function private.link_identified_user(uuid, uuid, uuid, bytea, timestamptz) to service_role;
grant execute on function private.snapshot_event_attribution(uuid) to service_role;
grant execute on function private.rebuild_activity_sessions(uuid) to service_role;
grant execute on function private.rebuild_revenue_and_subscriptions(uuid) to service_role;
grant execute on function private.rebuild_activity_metrics(uuid) to service_role;
grant execute on function private.process_installation_activity(uuid) to service_role;
grant execute on function private.assign_identity_app_user() to service_role;
grant execute on function private.assign_event_app_user() to service_role;

comment on table public.activity_sessions is
  'Server-derived sessions rebuilt in occurred_at order. A new session starts only after the app-configured inactivity threshold.';
comment on table public.revenue_ledger is
  'Idempotent accounting ledger. Refunds are negative entries; reported and verified revenue are deliberately separate.';
comment on table public.uninstall_inferences is
  'Probabilistic uninstall inferences created only from durable server-side evidence; never a confirmed uninstall.';
comment on function public.record_push_token_invalidation(uuid, uuid, text, text, text, timestamptz) is
  'Records hashed APNS/FCM invalidations. Two observations at least 24 hours apart are required before inferring an uninstall.';
