-- Attruvi reproducible acquisition metrics engine.
-- Raw events, costs, sessions and ledger entries remain the source of truth.

alter table public.apps
  add column if not exists active_metric_version text not null default 'metrics-v1';

alter table public.apps
  add constraint apps_metric_version_format
  check (active_metric_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$');

alter table public.ad_costs
  add column if not exists environment public.environment_kind not null default 'production',
  add column if not exists platform public.app_platform_kind;

alter table public.daily_metrics
  add column if not exists metric_level text not null default 'ad',
  add column if not exists environment public.environment_kind not null default 'production',
  add column if not exists platform public.app_platform_kind,
  add column if not exists cohort_users bigint not null default 0,
  add column if not exists session_users bigint not null default 0,
  add column if not exists eligible_d1 bigint not null default 0,
  add column if not exists eligible_d7 bigint not null default 0,
  add column if not exists eligible_d30 bigint not null default 0,
  add column if not exists ltv_eligible_d7 bigint not null default 0,
  add column if not exists ltv_eligible_d30 bigint not null default 0,
  add column if not exists ltv_eligible_d90 bigint not null default 0,
  add column if not exists revenue_d7_minor bigint not null default 0,
  add column if not exists revenue_d30_minor bigint not null default 0,
  add column if not exists revenue_d90_minor bigint not null default 0,
  add column if not exists uninstall_inferred bigint not null default 0,
  add column if not exists data_through_at timestamptz not null default statement_timestamp(),
  add column if not exists raw_hash text not null default '';

alter table public.daily_metrics
  add constraint daily_metrics_level
    check (metric_level in ('app', 'source', 'campaign', 'ad_group', 'ad')),
  add constraint daily_metrics_level_shape check (
    (metric_level = 'app' and source_id is null and campaign_id is null and ad_group_id is null and ad_id is null)
    or (metric_level = 'source' and source_id is not null and campaign_id is null and ad_group_id is null and ad_id is null)
    or (metric_level = 'campaign' and source_id is not null and campaign_id is not null and ad_group_id is null and ad_id is null)
    or (metric_level = 'ad_group' and source_id is not null and campaign_id is not null and ad_group_id is not null and ad_id is null)
    or (metric_level = 'ad' and source_id is not null and campaign_id is not null and ad_group_id is not null and ad_id is not null)
  ),
  add constraint daily_metrics_extended_nonnegative check (
    cohort_users >= 0 and session_users >= 0
    and eligible_d1 >= 0 and eligible_d7 >= 0 and eligible_d30 >= 0
    and ltv_eligible_d7 >= 0 and ltv_eligible_d30 >= 0 and ltv_eligible_d90 >= 0
    and uninstall_inferred >= 0
  );

drop index if exists public.daily_metrics_dimensions_unique_idx;
create unique index daily_metrics_dimensions_unique_idx
  on public.daily_metrics (
    app_id, environment, metric_date, metric_level, platform,
    source_id, campaign_id, ad_group_id, ad_id, currency, metric_version
  ) nulls not distinct;
create index daily_metrics_query_idx
  on public.daily_metrics (app_id, environment, metric_version, metric_level, metric_date, currency);
create index daily_metrics_source_query_idx
  on public.daily_metrics (app_id, environment, source_id, metric_level, metric_date)
  where source_id is not null;
create index ad_costs_metrics_range_idx
  on public.ad_costs (app_id, environment, cost_date, currency, source_id, campaign_id, ad_group_id, ad_id);
create index activity_sessions_metrics_idx
  on public.activity_sessions (app_id, installation_id, started_at);
create index revenue_ledger_metrics_idx
  on public.revenue_ledger (app_id, installation_id, occurred_at, currency);

create table public.metric_dirty_days (
  organization_id uuid not null,
  app_id uuid not null,
  environment public.environment_kind not null,
  metric_date date not null,
  reasons text[] not null default '{}',
  first_marked_at timestamptz not null default statement_timestamp(),
  last_marked_at timestamptz not null default statement_timestamp(),
  claimed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  primary key (app_id, environment, metric_date),
  constraint metric_dirty_days_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint metric_dirty_days_attempts check (attempts >= 0)
);

create index metric_dirty_days_claim_idx
  on public.metric_dirty_days (claimed_at, last_marked_at, app_id, metric_date);
create index metric_dirty_days_app_fk_idx
  on public.metric_dirty_days (app_id, organization_id);

create table public.metric_rollup_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  environment public.environment_kind not null,
  date_from date not null,
  date_to date not null,
  metric_version text not null,
  data_through_at timestamptz not null,
  status text not null,
  rows_written integer not null default 0,
  duration_ms integer,
  error_code text,
  started_at timestamptz not null default statement_timestamp(),
  finished_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint metric_rollup_runs_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint metric_rollup_runs_range check (date_from <= date_to),
  constraint metric_rollup_runs_status check (status in ('running', 'succeeded', 'failed')),
  constraint metric_rollup_runs_rows check (rows_written >= 0),
  constraint metric_rollup_runs_duration check (duration_ms is null or duration_ms >= 0)
);

create index metric_rollup_runs_app_time_idx
  on public.metric_rollup_runs (app_id, environment, started_at desc);
create index metric_rollup_runs_app_fk_idx
  on public.metric_rollup_runs (app_id, organization_id);

create table public.metric_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  environment public.environment_kind not null,
  date_from date not null,
  date_to date not null,
  metric_version text not null,
  data_through_at timestamptz not null,
  expected_rows integer not null,
  stored_rows integer not null,
  differing_rows integer not null,
  sample_differences jsonb not null default '[]'::jsonb,
  reconciled_at timestamptz not null default statement_timestamp(),
  constraint metric_reconciliation_runs_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint metric_reconciliation_runs_range check (date_from <= date_to),
  constraint metric_reconciliation_runs_counts check (
    expected_rows >= 0 and stored_rows >= 0 and differing_rows >= 0
  ),
  constraint metric_reconciliation_runs_sample check (jsonb_typeof(sample_differences) = 'array')
);

create index metric_reconciliation_runs_app_time_idx
  on public.metric_reconciliation_runs (app_id, environment, reconciled_at desc);
create index metric_reconciliation_runs_app_fk_idx
  on public.metric_reconciliation_runs (app_id, organization_id);

create or replace function private.mark_metric_day(
  requested_organization_id uuid,
  requested_app_id uuid,
  requested_environment public.environment_kind,
  requested_metric_date date,
  requested_reason text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.metric_dirty_days (
    organization_id, app_id, environment, metric_date, reasons
  ) values (
    requested_organization_id, requested_app_id, requested_environment,
    requested_metric_date, array[requested_reason]
  )
  on conflict (app_id, environment, metric_date) do update
  set reasons = (
        select array_agg(distinct reason order by reason)
        from unnest(public.metric_dirty_days.reasons || excluded.reasons) reason
      ),
      last_marked_at = statement_timestamp(),
      claimed_at = null,
      last_error = null;
$$;

create or replace function private.mark_metric_dirty_from_raw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_payload jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  requested_app_id uuid := (payload ->> 'app_id')::uuid;
  requested_organization_id uuid := (payload ->> 'organization_id')::uuid;
  requested_environment public.environment_kind;
  requested_metric_date date;
  installation_row record;
  app_timezone text;
begin
  select timezone into app_timezone from public.apps where id = requested_app_id;

  if tg_table_name = 'ad_costs' then
    requested_environment := (payload ->> 'environment')::public.environment_kind;
    requested_metric_date := (payload ->> 'cost_date')::date;
  elsif tg_table_name = 'installations' then
    requested_environment := (payload ->> 'environment')::public.environment_kind;
    requested_metric_date := ((payload ->> 'first_open_at')::timestamptz at time zone app_timezone)::date;
  elsif tg_table_name = 'link_clicks' then
    requested_metric_date := ((payload ->> 'clicked_at')::timestamptz at time zone app_timezone)::date;
    for requested_environment in select unnest(enum_range(null::public.environment_kind)) loop
      perform private.mark_metric_day(
        requested_organization_id, requested_app_id, requested_environment,
        requested_metric_date, tg_table_name || ':' || lower(tg_op)
      );
    end loop;
    if tg_op = 'DELETE' then return old; else return new; end if;
  else
    select installation.organization_id, installation.app_id,
           installation.environment,
           (installation.first_open_at at time zone app_timezone)::date as metric_date
      into installation_row
    from public.installations installation
    where installation.id = (payload ->> 'installation_id')::uuid;
    if not found then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    requested_organization_id := installation_row.organization_id;
    requested_app_id := installation_row.app_id;
    requested_environment := installation_row.environment;
    requested_metric_date := installation_row.metric_date;
  end if;

  perform private.mark_metric_day(
    requested_organization_id, requested_app_id, requested_environment,
    requested_metric_date, tg_table_name || ':' || lower(tg_op)
  );

  if old_payload is not null and tg_table_name = 'installations'
    and ((old_payload ->> 'environment') is distinct from (payload ->> 'environment')
      or (old_payload ->> 'first_open_at') is distinct from (payload ->> 'first_open_at')) then
    perform private.mark_metric_day(
      (old_payload ->> 'organization_id')::uuid,
      (old_payload ->> 'app_id')::uuid,
      (old_payload ->> 'environment')::public.environment_kind,
      ((old_payload ->> 'first_open_at')::timestamptz at time zone app_timezone)::date,
      tg_table_name || ':moved'
    );
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger installations_mark_metrics_dirty
after insert or update or delete on public.installations
for each row execute function private.mark_metric_dirty_from_raw();
create trigger attributions_mark_metrics_dirty
after insert or update or delete on public.attributions
for each row execute function private.mark_metric_dirty_from_raw();
create trigger activity_sessions_mark_metrics_dirty
after insert or update or delete on public.activity_sessions
for each row execute function private.mark_metric_dirty_from_raw();
create trigger revenue_ledger_mark_metrics_dirty
after insert or update or delete on public.revenue_ledger
for each row execute function private.mark_metric_dirty_from_raw();
create trigger uninstall_inferences_mark_metrics_dirty
after insert or update or delete on public.uninstall_inferences
for each row execute function private.mark_metric_dirty_from_raw();
create trigger ad_costs_mark_metrics_dirty
after insert or update or delete on public.ad_costs
for each row execute function private.mark_metric_dirty_from_raw();
create trigger link_clicks_mark_metrics_dirty
after insert or update or delete on public.link_clicks
for each row execute function private.mark_metric_dirty_from_raw();

create or replace function private.compute_daily_metrics(
  requested_app_id uuid,
  requested_environment public.environment_kind,
  requested_from date,
  requested_to date,
  requested_data_through_at timestamptz
)
returns table (
  organization_id uuid,
  app_id uuid,
  metric_date date,
  metric_level text,
  environment public.environment_kind,
  platform public.app_platform_kind,
  source_id uuid,
  campaign_id uuid,
  ad_group_id uuid,
  ad_id uuid,
  currency text,
  spend_minor bigint,
  revenue_minor bigint,
  clicks bigint,
  installs bigint,
  cohort_users bigint,
  registered_users bigint,
  buyers bigint,
  purchases bigint,
  sessions bigint,
  session_users bigint,
  retained_d1 bigint,
  eligible_d1 bigint,
  retained_d7 bigint,
  eligible_d7 bigint,
  retained_d30 bigint,
  eligible_d30 bigint,
  revenue_d7_minor bigint,
  ltv_eligible_d7 bigint,
  revenue_d30_minor bigint,
  ltv_eligible_d30 bigint,
  revenue_d90_minor bigint,
  ltv_eligible_d90 bigint,
  uninstall_inferred bigint,
  raw_hash text
)
language sql
stable
security invoker
set search_path = ''
as $$
with app_config as (
  select app.id, app.organization_id, app.timezone, app.currency
  from public.apps app
  where app.id = requested_app_id
),
install_base as (
  select
    installation.organization_id,
    installation.app_id,
    installation.id as installation_id,
    installation.platform,
    installation.first_open_at,
    (installation.first_open_at at time zone config.timezone)::date as cohort_date,
    user_link.app_user_id,
    coalesce(attribution.source_id, organic_source.id) as source_id,
    attribution.campaign_id,
    attribution.ad_group_id,
    attribution.ad_id
  from public.installations installation
  join app_config config on config.id = installation.app_id
  join public.app_user_installations user_link
    on user_link.app_id = installation.app_id
   and user_link.installation_id = installation.id
  left join public.attributions attribution
    on attribution.app_id = installation.app_id
   and attribution.installation_id = installation.id
   and attribution.scope = 'acquisition'
   and attribution.is_current
  left join lateral (
    select source.id
    from public.sources source
    where source.app_id = installation.app_id and source.kind = 'organic'
    order by source.created_at, source.id
    limit 1
  ) organic_source on true
  where installation.environment = requested_environment
    and (installation.first_open_at at time zone config.timezone)::date between requested_from and requested_to
    and installation.first_open_at <= requested_data_through_at
),
currency_set as (
  select config.currency from app_config config
  union
  select cost.currency from public.ad_costs cost
  where cost.app_id = requested_app_id
    and cost.environment = requested_environment
    and cost.cost_date between requested_from and requested_to
  union
  select ledger.currency
  from public.revenue_ledger ledger
  join install_base installation on installation.installation_id = ledger.installation_id
),
session_facts as (
  select
    installation.installation_id,
    count(session.id)::bigint as sessions,
    count(session.id) filter (
      where (session.started_at at time zone config.timezone)::date = installation.cohort_date + 1
    ) > 0 as retained_d1,
    count(session.id) filter (
      where (session.started_at at time zone config.timezone)::date = installation.cohort_date + 7
    ) > 0 as retained_d7,
    count(session.id) filter (
      where (session.started_at at time zone config.timezone)::date = installation.cohort_date + 30
    ) > 0 as retained_d30
  from install_base installation
  join app_config config on true
  left join public.activity_sessions session
    on session.installation_id = installation.installation_id
   and session.started_at <= requested_data_through_at
  group by installation.installation_id
),
signup_facts as (
  select installation.installation_id,
         bool_or(event.name = 'sign_up') as registered
  from install_base installation
  left join public.events event
    on event.installation_id = installation.installation_id
   and event.occurred_at <= requested_data_through_at
   and event.name = 'sign_up'
  group by installation.installation_id
),
revenue_facts as (
  select
    installation.installation_id,
    currency.currency,
    coalesce(sum(ledger.revenue_reported_minor) filter (
      where ledger.currency = currency.currency
    ), 0)::bigint as revenue_minor,
    coalesce(sum(ledger.revenue_reported_minor) filter (
      where ledger.currency = currency.currency
        and (ledger.occurred_at at time zone config.timezone)::date
          between installation.cohort_date and installation.cohort_date + 7
    ), 0)::bigint as revenue_d7_minor,
    coalesce(sum(ledger.revenue_reported_minor) filter (
      where ledger.currency = currency.currency
        and (ledger.occurred_at at time zone config.timezone)::date
          between installation.cohort_date and installation.cohort_date + 30
    ), 0)::bigint as revenue_d30_minor,
    coalesce(sum(ledger.revenue_reported_minor) filter (
      where ledger.currency = currency.currency
        and (ledger.occurred_at at time zone config.timezone)::date
          between installation.cohort_date and installation.cohort_date + 90
    ), 0)::bigint as revenue_d90_minor,
    count(ledger.id) filter (
      where ledger.currency = currency.currency
        and ledger.event_type in ('purchase', 'subscription_started', 'subscription_renewed')
    )::bigint as purchases,
    bool_or(
      ledger.currency = currency.currency
      and ledger.event_type in ('purchase', 'subscription_started', 'subscription_renewed')
      and ledger.revenue_reported_minor > 0
    ) as buyer
  from install_base installation
  cross join currency_set currency
  join app_config config on true
  left join public.revenue_ledger ledger
    on ledger.installation_id = installation.installation_id
   and ledger.occurred_at <= requested_data_through_at
  group by installation.installation_id, currency.currency, installation.cohort_date
),
install_currency_facts as (
  select
    installation.*,
    currency.currency,
    coalesce(session.sessions, 0)::bigint as sessions,
    coalesce(session.retained_d1, false) as retained_d1,
    coalesce(session.retained_d7, false) as retained_d7,
    coalesce(session.retained_d30, false) as retained_d30,
    coalesce(signup.registered, false) as registered,
    coalesce(revenue.revenue_minor, 0)::bigint as revenue_minor,
    coalesce(revenue.revenue_d7_minor, 0)::bigint as revenue_d7_minor,
    coalesce(revenue.revenue_d30_minor, 0)::bigint as revenue_d30_minor,
    coalesce(revenue.revenue_d90_minor, 0)::bigint as revenue_d90_minor,
    coalesce(revenue.purchases, 0)::bigint as purchases,
    coalesce(revenue.buyer, false) as buyer,
    exists (
      select 1 from public.uninstall_inferences inference
      where inference.installation_id = installation.installation_id
        and inference.status = 'active'
        and inference.inferred_at <= requested_data_through_at
    ) as uninstall_inferred,
    ((requested_data_through_at at time zone config.timezone)::date >= installation.cohort_date + 1) as eligible_d1,
    ((requested_data_through_at at time zone config.timezone)::date >= installation.cohort_date + 7) as eligible_d7,
    ((requested_data_through_at at time zone config.timezone)::date >= installation.cohort_date + 30) as eligible_d30,
    ((requested_data_through_at at time zone config.timezone)::date >= installation.cohort_date + 90) as eligible_d90
  from install_base installation
  cross join currency_set currency
  join app_config config on true
  left join session_facts session on session.installation_id = installation.installation_id
  left join signup_facts signup on signup.installation_id = installation.installation_id
  left join revenue_facts revenue
    on revenue.installation_id = installation.installation_id
   and revenue.currency = currency.currency
),
expanded_install as (
  select fact.*, dimension.metric_level,
         dimension.dimension_source_id,
         dimension.dimension_campaign_id,
         dimension.dimension_ad_group_id,
         dimension.dimension_ad_id
  from install_currency_facts fact
  cross join lateral (
    values
      ('app'::text, null::uuid, null::uuid, null::uuid, null::uuid),
      ('source', fact.source_id, null::uuid, null::uuid, null::uuid),
      ('campaign', fact.source_id, fact.campaign_id, null::uuid, null::uuid),
      ('ad_group', fact.source_id, fact.campaign_id, fact.ad_group_id, null::uuid),
      ('ad', fact.source_id, fact.campaign_id, fact.ad_group_id, fact.ad_id)
  ) dimension(metric_level, dimension_source_id, dimension_campaign_id, dimension_ad_group_id, dimension_ad_id)
  where dimension.metric_level = 'app'
     or (dimension.metric_level = 'source' and dimension.dimension_source_id is not null)
     or (dimension.metric_level = 'campaign' and dimension.dimension_campaign_id is not null)
     or (dimension.metric_level = 'ad_group' and dimension.dimension_ad_group_id is not null)
     or (dimension.metric_level = 'ad' and dimension.dimension_ad_id is not null)
),
outcome_rollup as (
  select
    fact.organization_id, fact.app_id, fact.cohort_date as metric_date,
    fact.metric_level, requested_environment as environment, fact.platform,
    fact.dimension_source_id as source_id,
    fact.dimension_campaign_id as campaign_id,
    fact.dimension_ad_group_id as ad_group_id,
    fact.dimension_ad_id as ad_id,
    fact.currency,
    count(distinct fact.installation_id)::bigint as installs,
    count(distinct fact.app_user_id)::bigint as cohort_users,
    count(distinct fact.app_user_id) filter (where fact.registered)::bigint as registered_users,
    count(distinct fact.app_user_id) filter (where fact.buyer)::bigint as buyers,
    sum(fact.purchases)::bigint as purchases,
    sum(fact.sessions)::bigint as sessions,
    count(distinct fact.app_user_id) filter (where fact.sessions > 0)::bigint as session_users,
    count(distinct fact.installation_id) filter (where fact.eligible_d1 and fact.retained_d1)::bigint as retained_d1,
    count(distinct fact.installation_id) filter (where fact.eligible_d1)::bigint as eligible_d1,
    count(distinct fact.installation_id) filter (where fact.eligible_d7 and fact.retained_d7)::bigint as retained_d7,
    count(distinct fact.installation_id) filter (where fact.eligible_d7)::bigint as eligible_d7,
    count(distinct fact.installation_id) filter (where fact.eligible_d30 and fact.retained_d30)::bigint as retained_d30,
    count(distinct fact.installation_id) filter (where fact.eligible_d30)::bigint as eligible_d30,
    sum(fact.revenue_minor)::bigint as revenue_minor,
    sum(fact.revenue_d7_minor) filter (where fact.eligible_d7)::bigint as revenue_d7_minor,
    count(distinct fact.app_user_id) filter (where fact.eligible_d7)::bigint as ltv_eligible_d7,
    sum(fact.revenue_d30_minor) filter (where fact.eligible_d30)::bigint as revenue_d30_minor,
    count(distinct fact.app_user_id) filter (where fact.eligible_d30)::bigint as ltv_eligible_d30,
    sum(fact.revenue_d90_minor) filter (where fact.eligible_d90)::bigint as revenue_d90_minor,
    count(distinct fact.app_user_id) filter (where fact.eligible_d90)::bigint as ltv_eligible_d90,
    count(distinct fact.installation_id) filter (where fact.uninstall_inferred)::bigint as uninstall_inferred
  from expanded_install fact
  group by fact.organization_id, fact.app_id, fact.cohort_date, fact.metric_level,
           fact.platform, fact.dimension_source_id, fact.dimension_campaign_id,
           fact.dimension_ad_group_id, fact.dimension_ad_id, fact.currency
),
expanded_cost as (
  select
    cost.organization_id, cost.app_id, cost.cost_date as metric_date,
    dimension.metric_level, cost.environment, cost.platform,
    dimension.dimension_source_id as source_id,
    dimension.dimension_campaign_id as campaign_id,
    dimension.dimension_ad_group_id as ad_group_id,
    dimension.dimension_ad_id as ad_id,
    cost.currency, cost.amount_minor, cost.clicks
  from public.ad_costs cost
  cross join lateral (
    values
      ('app'::text, null::uuid, null::uuid, null::uuid, null::uuid),
      ('source', cost.source_id, null::uuid, null::uuid, null::uuid),
      ('campaign', cost.source_id, cost.campaign_id, null::uuid, null::uuid),
      ('ad_group', cost.source_id, cost.campaign_id, cost.ad_group_id, null::uuid),
      ('ad', cost.source_id, cost.campaign_id, cost.ad_group_id, cost.ad_id)
  ) dimension(metric_level, dimension_source_id, dimension_campaign_id, dimension_ad_group_id, dimension_ad_id)
  where cost.app_id = requested_app_id
    and cost.environment = requested_environment
    and cost.cost_date between requested_from and requested_to
    and (dimension.metric_level = 'app'
      or (dimension.metric_level = 'source' and dimension.dimension_source_id is not null)
      or (dimension.metric_level = 'campaign' and dimension.dimension_campaign_id is not null)
      or (dimension.metric_level = 'ad_group' and dimension.dimension_ad_group_id is not null)
      or (dimension.metric_level = 'ad' and dimension.dimension_ad_id is not null))
),
cost_rollup as (
  select organization_id, app_id, metric_date, metric_level, environment, platform,
         source_id, campaign_id, ad_group_id, ad_id, currency,
         sum(amount_minor)::bigint as spend_minor,
         sum(clicks)::bigint as clicks
  from expanded_cost
  group by organization_id, app_id, metric_date, metric_level, environment, platform,
           source_id, campaign_id, ad_group_id, ad_id, currency
),
expanded_owned_click as (
  select
    click.organization_id, click.app_id,
    (click.clicked_at at time zone config.timezone)::date as metric_date,
    requested_environment as environment,
    case when click.destination_platform in ('ios', 'android')
      then click.destination_platform::public.app_platform_kind else null end as platform,
    dimension.metric_level,
    dimension.dimension_source_id as source_id,
    dimension.dimension_campaign_id as campaign_id,
    dimension.dimension_ad_group_id as ad_group_id,
    dimension.dimension_ad_id as ad_id
  from public.link_clicks click
  join public.smart_links link on link.id = click.smart_link_id
  join public.sources source on source.id = link.source_id
  join app_config config on true
  cross join lateral (
    values
      ('app'::text, null::uuid, null::uuid, null::uuid, null::uuid),
      ('source', link.source_id, null::uuid, null::uuid, null::uuid),
      ('campaign', link.source_id, link.campaign_id, null::uuid, null::uuid),
      ('ad_group', link.source_id, link.campaign_id, link.ad_group_id, null::uuid),
      ('ad', link.source_id, link.campaign_id, link.ad_group_id, link.ad_id)
  ) dimension(metric_level, dimension_source_id, dimension_campaign_id, dimension_ad_group_id, dimension_ad_id)
  where click.app_id = requested_app_id
    and not click.is_bot
    and source.kind in ('affiliate', 'influencer', 'organic', 'other', 'manual')
    and (click.clicked_at at time zone config.timezone)::date between requested_from and requested_to
    and click.clicked_at <= requested_data_through_at
    and (dimension.metric_level = 'app'
      or (dimension.metric_level = 'source' and dimension.dimension_source_id is not null)
      or (dimension.metric_level = 'campaign' and dimension.dimension_campaign_id is not null)
      or (dimension.metric_level = 'ad_group' and dimension.dimension_ad_group_id is not null)
      or (dimension.metric_level = 'ad' and dimension.dimension_ad_id is not null))
),
owned_click_rollup as (
  select click.organization_id, click.app_id, click.metric_date, click.metric_level,
         click.environment, click.platform, click.source_id, click.campaign_id,
         click.ad_group_id, click.ad_id, currency.currency,
         count(*)::bigint as clicks
  from expanded_owned_click click
  cross join currency_set currency
  group by click.organization_id, click.app_id, click.metric_date, click.metric_level,
           click.environment, click.platform, click.source_id, click.campaign_id,
           click.ad_group_id, click.ad_id, currency.currency
),
all_keys as (
  select organization_id, app_id, metric_date, metric_level, environment, platform,
         source_id, campaign_id, ad_group_id, ad_id, currency from outcome_rollup
  union
  select organization_id, app_id, metric_date, metric_level, environment, platform,
         source_id, campaign_id, ad_group_id, ad_id, currency from cost_rollup
  union
  select organization_id, app_id, metric_date, metric_level, environment, platform,
         source_id, campaign_id, ad_group_id, ad_id, currency from owned_click_rollup
),
combined as (
  select
    key.organization_id, key.app_id, key.metric_date, key.metric_level,
    key.environment, key.platform, key.source_id, key.campaign_id,
    key.ad_group_id, key.ad_id, key.currency,
    coalesce(cost.spend_minor, 0)::bigint as spend_minor,
    coalesce(outcome.revenue_minor, 0)::bigint as revenue_minor,
    (coalesce(cost.clicks, 0) + coalesce(owned_click.clicks, 0))::bigint as clicks,
    coalesce(outcome.installs, 0)::bigint as installs,
    coalesce(outcome.cohort_users, 0)::bigint as cohort_users,
    coalesce(outcome.registered_users, 0)::bigint as registered_users,
    coalesce(outcome.buyers, 0)::bigint as buyers,
    coalesce(outcome.purchases, 0)::bigint as purchases,
    coalesce(outcome.sessions, 0)::bigint as sessions,
    coalesce(outcome.session_users, 0)::bigint as session_users,
    coalesce(outcome.retained_d1, 0)::bigint as retained_d1,
    coalesce(outcome.eligible_d1, 0)::bigint as eligible_d1,
    coalesce(outcome.retained_d7, 0)::bigint as retained_d7,
    coalesce(outcome.eligible_d7, 0)::bigint as eligible_d7,
    coalesce(outcome.retained_d30, 0)::bigint as retained_d30,
    coalesce(outcome.eligible_d30, 0)::bigint as eligible_d30,
    coalesce(outcome.revenue_d7_minor, 0)::bigint as revenue_d7_minor,
    coalesce(outcome.ltv_eligible_d7, 0)::bigint as ltv_eligible_d7,
    coalesce(outcome.revenue_d30_minor, 0)::bigint as revenue_d30_minor,
    coalesce(outcome.ltv_eligible_d30, 0)::bigint as ltv_eligible_d30,
    coalesce(outcome.revenue_d90_minor, 0)::bigint as revenue_d90_minor,
    coalesce(outcome.ltv_eligible_d90, 0)::bigint as ltv_eligible_d90,
    coalesce(outcome.uninstall_inferred, 0)::bigint as uninstall_inferred
  from all_keys key
  left join outcome_rollup outcome
    on (outcome.app_id, outcome.metric_date, outcome.metric_level, outcome.environment,
        outcome.platform, outcome.source_id, outcome.campaign_id, outcome.ad_group_id,
        outcome.ad_id, outcome.currency)
       is not distinct from
       (key.app_id, key.metric_date, key.metric_level, key.environment,
        key.platform, key.source_id, key.campaign_id, key.ad_group_id, key.ad_id, key.currency)
  left join cost_rollup cost
    on (cost.app_id, cost.metric_date, cost.metric_level, cost.environment,
        cost.platform, cost.source_id, cost.campaign_id, cost.ad_group_id,
        cost.ad_id, cost.currency)
       is not distinct from
       (key.app_id, key.metric_date, key.metric_level, key.environment,
        key.platform, key.source_id, key.campaign_id, key.ad_group_id, key.ad_id, key.currency)
  left join owned_click_rollup owned_click
    on (owned_click.app_id, owned_click.metric_date, owned_click.metric_level,
        owned_click.environment, owned_click.platform, owned_click.source_id,
        owned_click.campaign_id, owned_click.ad_group_id, owned_click.ad_id,
        owned_click.currency)
       is not distinct from
       (key.app_id, key.metric_date, key.metric_level, key.environment,
        key.platform, key.source_id, key.campaign_id, key.ad_group_id, key.ad_id, key.currency)
)
select combined.*,
       encode(extensions.digest(
         concat_ws('|', combined.organization_id, combined.app_id, combined.metric_date,
           combined.metric_level, combined.environment, coalesce(combined.platform::text, ''),
           coalesce(combined.source_id::text, ''), coalesce(combined.campaign_id::text, ''),
           coalesce(combined.ad_group_id::text, ''), coalesce(combined.ad_id::text, ''),
           combined.currency, combined.spend_minor, combined.revenue_minor, combined.clicks,
           combined.installs, combined.cohort_users, combined.registered_users, combined.buyers,
           combined.purchases, combined.sessions, combined.session_users, combined.retained_d1,
           combined.eligible_d1, combined.retained_d7, combined.eligible_d7,
           combined.retained_d30, combined.eligible_d30, combined.revenue_d7_minor,
           combined.ltv_eligible_d7, combined.revenue_d30_minor, combined.ltv_eligible_d30,
           combined.revenue_d90_minor, combined.ltv_eligible_d90, combined.uninstall_inferred),
         'sha256'), 'hex') as raw_hash
from combined;
$$;

create or replace function public.recalculate_daily_metrics(
  requested_app_id uuid,
  requested_environment public.environment_kind,
  requested_from date,
  requested_to date,
  requested_metric_version text default 'metrics-v1',
  requested_data_through_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_organization_id uuid;
  run_id uuid;
  run_started_at timestamptz := clock_timestamp();
  affected_rows integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if requested_from > requested_to
    or requested_to - requested_from > 366
    or requested_metric_version !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$' then
    raise exception 'invalid_metric_recalculation_request' using errcode = '22023';
  end if;

  select organization_id into strict requested_organization_id
  from public.apps where id = requested_app_id;

  insert into public.metric_rollup_runs (
    organization_id, app_id, environment, date_from, date_to,
    metric_version, data_through_at, status
  ) values (
    requested_organization_id, requested_app_id, requested_environment,
    requested_from, requested_to, requested_metric_version,
    requested_data_through_at, 'running'
  ) returning id into run_id;

  delete from public.daily_metrics
  where app_id = requested_app_id
    and environment = requested_environment
    and metric_date between requested_from and requested_to
    and metric_version = requested_metric_version;

  insert into public.daily_metrics (
    organization_id, app_id, metric_date, metric_level, environment, platform,
    source_id, campaign_id, ad_group_id, ad_id, currency,
    spend_minor, revenue_minor, clicks, installs, cohort_users, registered_users,
    buyers, purchases, sessions, session_users, retained_d1, eligible_d1,
    retained_d7, eligible_d7, retained_d30, eligible_d30,
    revenue_d7_minor, ltv_eligible_d7, revenue_d30_minor, ltv_eligible_d30,
    revenue_d90_minor, ltv_eligible_d90, uninstall_inferred,
    metric_version, calculated_at, data_through_at, raw_hash
  )
  select
    metric.organization_id, metric.app_id, metric.metric_date, metric.metric_level,
    metric.environment, metric.platform, metric.source_id, metric.campaign_id,
    metric.ad_group_id, metric.ad_id, metric.currency, metric.spend_minor,
    metric.revenue_minor, metric.clicks, metric.installs, metric.cohort_users,
    metric.registered_users, metric.buyers, metric.purchases, metric.sessions,
    metric.session_users, metric.retained_d1, metric.eligible_d1,
    metric.retained_d7, metric.eligible_d7, metric.retained_d30,
    metric.eligible_d30, metric.revenue_d7_minor, metric.ltv_eligible_d7,
    metric.revenue_d30_minor, metric.ltv_eligible_d30, metric.revenue_d90_minor,
    metric.ltv_eligible_d90, metric.uninstall_inferred,
    requested_metric_version, statement_timestamp(), requested_data_through_at, metric.raw_hash
  from private.compute_daily_metrics(
    requested_app_id, requested_environment, requested_from, requested_to,
    requested_data_through_at
  ) metric;
  get diagnostics affected_rows = row_count;

  update public.apps
  set active_metric_version = requested_metric_version,
      updated_at = statement_timestamp()
  where id = requested_app_id;

  delete from public.metric_dirty_days
  where app_id = requested_app_id
    and environment = requested_environment
    and metric_date between requested_from and requested_to;

  update public.metric_rollup_runs
  set status = 'succeeded', rows_written = affected_rows,
      duration_ms = greatest(0, extract(milliseconds from clock_timestamp() - run_started_at)::integer),
      finished_at = clock_timestamp()
  where id = run_id;

  return jsonb_build_object(
    'runId', run_id, 'rowsWritten', affected_rows,
    'metricVersion', requested_metric_version,
    'from', requested_from, 'to', requested_to,
    'dataThroughAt', requested_data_through_at
  );
exception when others then
  if run_id is not null then
    update public.metric_rollup_runs
    set status = 'failed', error_code = sqlstate,
        duration_ms = greatest(0, extract(milliseconds from clock_timestamp() - run_started_at)::integer),
        finished_at = clock_timestamp()
    where id = run_id;
  end if;
  raise;
end;
$$;

create or replace function public.claim_metric_dirty_days(requested_limit integer default 50)
returns table (
  organization_id uuid,
  app_id uuid,
  environment public.environment_kind,
  metric_date date,
  reasons text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if requested_limit not between 1 and 500 then
    raise exception 'invalid_claim_limit' using errcode = '22023';
  end if;

  return query
  with claimed as (
    select dirty.app_id, dirty.environment, dirty.metric_date
    from public.metric_dirty_days dirty
    where dirty.claimed_at is null or dirty.claimed_at < statement_timestamp() - interval '15 minutes'
    order by dirty.last_marked_at
    for update skip locked
    limit requested_limit
  )
  update public.metric_dirty_days dirty
  set claimed_at = statement_timestamp(), attempts = dirty.attempts + 1
  from claimed
  where dirty.app_id = claimed.app_id
    and dirty.environment = claimed.environment
    and dirty.metric_date = claimed.metric_date
  returning dirty.organization_id, dirty.app_id, dirty.environment, dirty.metric_date, dirty.reasons;
end;
$$;

create or replace function public.release_metric_dirty_day(
  requested_app_id uuid,
  requested_environment public.environment_kind,
  requested_metric_date date,
  requested_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  update public.metric_dirty_days
  set claimed_at = null,
      last_error = left(coalesce(requested_error, 'unknown_error'), 240)
  where app_id = requested_app_id
    and environment = requested_environment
    and metric_date = requested_metric_date;
end;
$$;

create or replace function public.reconcile_daily_metrics(
  requested_app_id uuid,
  requested_environment public.environment_kind,
  requested_from date,
  requested_to date,
  requested_metric_version text default null,
  requested_data_through_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_organization_id uuid;
  effective_version text;
  effective_through timestamptz;
  expected_count integer;
  stored_count integer;
  difference_count integer;
  differences jsonb;
  run_id uuid;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  select organization_id, coalesce(requested_metric_version, active_metric_version)
    into strict requested_organization_id, effective_version
  from public.apps where id = requested_app_id;

  select coalesce(requested_data_through_at, min(data_through_at), statement_timestamp())
    into effective_through
  from public.daily_metrics
  where app_id = requested_app_id and environment = requested_environment
    and metric_date between requested_from and requested_to
    and metric_version = effective_version;

  with expected as (
    select * from private.compute_daily_metrics(
      requested_app_id, requested_environment, requested_from, requested_to, effective_through
    )
  ), stored as (
    select * from public.daily_metrics metric
    where metric.app_id = requested_app_id
      and metric.environment = requested_environment
      and metric.metric_date between requested_from and requested_to
      and metric.metric_version = effective_version
  ), comparison as (
    select
      coalesce(expected.metric_date, stored.metric_date) as metric_date,
      coalesce(expected.metric_level, stored.metric_level) as metric_level,
      coalesce(expected.currency, stored.currency) as currency,
      expected.raw_hash as expected_hash,
      stored.raw_hash as stored_hash
    from expected
    full join stored
      on expected.app_id = stored.app_id
     and expected.metric_date = stored.metric_date
     and expected.metric_level = stored.metric_level
     and expected.environment = stored.environment
     and coalesce(expected.platform::text, '') = coalesce(stored.platform::text, '')
     and coalesce(expected.source_id, '00000000-0000-0000-0000-000000000000')
       = coalesce(stored.source_id, '00000000-0000-0000-0000-000000000000')
     and coalesce(expected.campaign_id, '00000000-0000-0000-0000-000000000000')
       = coalesce(stored.campaign_id, '00000000-0000-0000-0000-000000000000')
     and coalesce(expected.ad_group_id, '00000000-0000-0000-0000-000000000000')
       = coalesce(stored.ad_group_id, '00000000-0000-0000-0000-000000000000')
     and coalesce(expected.ad_id, '00000000-0000-0000-0000-000000000000')
       = coalesce(stored.ad_id, '00000000-0000-0000-0000-000000000000')
     and expected.currency = stored.currency
  ), sampled as (
    select * from comparison
    where expected_hash is distinct from stored_hash
    order by metric_date, metric_level, currency
    limit 20
  )
  select
    (select count(*)::integer from expected),
    (select count(*)::integer from stored),
    (select count(*)::integer from comparison where expected_hash is distinct from stored_hash),
    coalesce((select jsonb_agg(to_jsonb(sampled)) from sampled), '[]'::jsonb)
  into expected_count, stored_count, difference_count, differences;

  insert into public.metric_reconciliation_runs (
    organization_id, app_id, environment, date_from, date_to, metric_version,
    data_through_at, expected_rows, stored_rows, differing_rows, sample_differences
  ) values (
    requested_organization_id, requested_app_id, requested_environment,
    requested_from, requested_to, effective_version, effective_through,
    expected_count, stored_count, difference_count, differences
  ) returning id into run_id;

  return jsonb_build_object(
    'runId', run_id, 'matches', difference_count = 0,
    'expectedRows', expected_count, 'storedRows', stored_count,
    'differingRows', difference_count, 'sampleDifferences', differences,
    'metricVersion', effective_version, 'dataThroughAt', effective_through
  );
end;
$$;

create or replace function public.query_metric_rollups(
  requested_app_id uuid,
  requested_environment public.environment_kind,
  requested_from date,
  requested_to date,
  requested_level text default 'source',
  requested_currency text default null,
  requested_platform public.app_platform_kind default null,
  requested_source_id uuid default null,
  requested_granularity text default 'total'
)
returns table (
  metric_date date,
  metric_level text,
  platform public.app_platform_kind,
  source_id uuid,
  source_name text,
  campaign_id uuid,
  campaign_name text,
  ad_group_id uuid,
  ad_group_name text,
  ad_id uuid,
  ad_name text,
  currency text,
  spend_minor bigint,
  clicks bigint,
  installs bigint,
  cpi_minor numeric,
  registered_users bigint,
  registration_rate numeric,
  buyers bigint,
  buyer_rate numeric,
  cac_minor numeric,
  purchases bigint,
  purchase_rate numeric,
  revenue_minor bigint,
  roas numeric,
  retention_d1 numeric,
  retention_d7 numeric,
  retention_d30 numeric,
  sessions_per_user numeric,
  observed_ltv_d7_minor numeric,
  observed_ltv_d30_minor numeric,
  observed_ltv_d90_minor numeric,
  observed_ltv_lifetime_minor numeric,
  uninstall_inferred_rate numeric,
  metric_version text,
  data_through_at timestamptz,
  calculated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  effective_currency text;
  effective_version text;
  requested_organization_id uuid;
begin
  if requested_from > requested_to or requested_to - requested_from > 3660
    or requested_level not in ('app', 'source', 'campaign', 'ad_group', 'ad')
    or requested_granularity not in ('total', 'day') then
    raise exception 'invalid_metric_query' using errcode = '22023';
  end if;

  select app.organization_id, coalesce(requested_currency, app.currency), app.active_metric_version
    into requested_organization_id, effective_currency, effective_version
  from public.apps app
  where app.id = requested_app_id;

  if requested_organization_id is null
    or ((select auth.role()) <> 'service_role'
    and not (select private.is_organization_member(requested_organization_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with grouped as (
    select
      case when requested_granularity = 'day' then metric.metric_date else null end as bucket_date,
      metric.metric_level,
      case when requested_platform is null then null else metric.platform end as platform,
      metric.source_id, metric.campaign_id,
      metric.ad_group_id, metric.ad_id, metric.currency,
      sum(metric.spend_minor)::bigint as spend_minor,
      sum(metric.clicks)::bigint as clicks,
      sum(metric.installs)::bigint as installs,
      sum(metric.registered_users)::bigint as registered_users,
      sum(metric.buyers)::bigint as buyers,
      sum(metric.purchases)::bigint as purchases,
      sum(metric.revenue_minor)::bigint as revenue_minor,
      sum(metric.retained_d1)::bigint as retained_d1,
      sum(metric.eligible_d1)::bigint as eligible_d1,
      sum(metric.retained_d7)::bigint as retained_d7,
      sum(metric.eligible_d7)::bigint as eligible_d7,
      sum(metric.retained_d30)::bigint as retained_d30,
      sum(metric.eligible_d30)::bigint as eligible_d30,
      sum(metric.sessions)::bigint as sessions,
      sum(metric.cohort_users)::bigint as cohort_users,
      sum(metric.revenue_d7_minor)::bigint as revenue_d7_minor,
      sum(metric.ltv_eligible_d7)::bigint as ltv_eligible_d7,
      sum(metric.revenue_d30_minor)::bigint as revenue_d30_minor,
      sum(metric.ltv_eligible_d30)::bigint as ltv_eligible_d30,
      sum(metric.revenue_d90_minor)::bigint as revenue_d90_minor,
      sum(metric.ltv_eligible_d90)::bigint as ltv_eligible_d90,
      sum(metric.uninstall_inferred)::bigint as uninstall_inferred,
      metric.metric_version,
      min(metric.data_through_at) as data_through_at,
      min(metric.calculated_at) as calculated_at
    from public.daily_metrics metric
    where metric.app_id = requested_app_id
      and metric.environment = requested_environment
      and metric.metric_date between requested_from and requested_to
      and metric.metric_level = requested_level
      and metric.metric_version = effective_version
      and metric.currency = effective_currency
      and (requested_platform is null or metric.platform = requested_platform)
      and (requested_source_id is null or metric.source_id = requested_source_id)
    group by bucket_date, metric.metric_level,
             case when requested_platform is null then null else metric.platform end,
             metric.source_id,
             metric.campaign_id, metric.ad_group_id, metric.ad_id, metric.currency,
             metric.metric_version
  )
  select
    grouped.bucket_date, grouped.metric_level, grouped.platform,
    grouped.source_id, source.name, grouped.campaign_id, campaign.name,
    grouped.ad_group_id, ad_group.name, grouped.ad_id, ad.name, grouped.currency,
    grouped.spend_minor, grouped.clicks, grouped.installs,
    grouped.spend_minor::numeric / nullif(grouped.installs, 0),
    grouped.registered_users,
    grouped.registered_users::numeric / nullif(grouped.installs, 0),
    grouped.buyers,
    grouped.buyers::numeric / nullif(grouped.installs, 0),
    grouped.spend_minor::numeric / nullif(grouped.buyers, 0),
    grouped.purchases,
    grouped.purchases::numeric / nullif(grouped.installs, 0),
    grouped.revenue_minor,
    grouped.revenue_minor::numeric / nullif(grouped.spend_minor, 0),
    grouped.retained_d1::numeric / nullif(grouped.eligible_d1, 0),
    grouped.retained_d7::numeric / nullif(grouped.eligible_d7, 0),
    grouped.retained_d30::numeric / nullif(grouped.eligible_d30, 0),
    grouped.sessions::numeric / nullif(grouped.cohort_users, 0),
    grouped.revenue_d7_minor::numeric / nullif(grouped.ltv_eligible_d7, 0),
    grouped.revenue_d30_minor::numeric / nullif(grouped.ltv_eligible_d30, 0),
    grouped.revenue_d90_minor::numeric / nullif(grouped.ltv_eligible_d90, 0),
    grouped.revenue_minor::numeric / nullif(grouped.cohort_users, 0),
    grouped.uninstall_inferred::numeric / nullif(grouped.installs, 0),
    grouped.metric_version, grouped.data_through_at, grouped.calculated_at
  from grouped
  left join public.sources source on source.id = grouped.source_id
  left join public.campaigns campaign on campaign.id = grouped.campaign_id
  left join public.ad_groups ad_group on ad_group.id = grouped.ad_group_id
  left join public.ads ad on ad.id = grouped.ad_id
  order by grouped.bucket_date nulls first, grouped.revenue_minor desc, grouped.source_id;
end;
$$;

alter table public.metric_dirty_days enable row level security;
alter table public.metric_rollup_runs enable row level security;
alter table public.metric_reconciliation_runs enable row level security;

create policy metric_dirty_days_member_select on public.metric_dirty_days
for select to authenticated
using ((select private.is_organization_member(organization_id)));
create policy metric_rollup_runs_member_select on public.metric_rollup_runs
for select to authenticated
using ((select private.is_organization_member(organization_id)));
create policy metric_reconciliation_runs_member_select on public.metric_reconciliation_runs
for select to authenticated
using ((select private.is_organization_member(organization_id)));

revoke all on table public.metric_dirty_days from anon, authenticated;
revoke all on table public.metric_rollup_runs from anon, authenticated;
revoke all on table public.metric_reconciliation_runs from anon, authenticated;
grant select on table public.metric_dirty_days to authenticated;
grant select on table public.metric_rollup_runs to authenticated;
grant select on table public.metric_reconciliation_runs to authenticated;
grant all on table public.metric_dirty_days to service_role;
grant all on table public.metric_rollup_runs to service_role;
grant all on table public.metric_reconciliation_runs to service_role;

revoke execute on function public.recalculate_daily_metrics(uuid, public.environment_kind, date, date, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_metric_dirty_days(integer) from public, anon, authenticated;
revoke execute on function public.release_metric_dirty_day(uuid, public.environment_kind, date, text) from public, anon, authenticated;
revoke execute on function public.reconcile_daily_metrics(uuid, public.environment_kind, date, date, text, timestamptz) from public, anon, authenticated;
grant execute on function public.recalculate_daily_metrics(uuid, public.environment_kind, date, date, text, timestamptz) to service_role;
grant execute on function public.claim_metric_dirty_days(integer) to service_role;
grant execute on function public.release_metric_dirty_day(uuid, public.environment_kind, date, text) to service_role;
grant execute on function public.reconcile_daily_metrics(uuid, public.environment_kind, date, date, text, timestamptz) to service_role;

revoke execute on function public.query_metric_rollups(uuid, public.environment_kind, date, date, text, text, public.app_platform_kind, uuid, text) from public, anon;
grant execute on function public.query_metric_rollups(uuid, public.environment_kind, date, date, text, text, public.app_platform_kind, uuid, text) to authenticated;
grant execute on function public.query_metric_rollups(uuid, public.environment_kind, date, date, text, text, public.app_platform_kind, uuid, text) to service_role;

revoke execute on function private.compute_daily_metrics(uuid, public.environment_kind, date, date, timestamptz) from public, anon, authenticated;
revoke execute on function private.mark_metric_day(uuid, uuid, public.environment_kind, date, text) from public, anon, authenticated;
revoke execute on function private.mark_metric_dirty_from_raw() from public, anon, authenticated;
grant execute on function private.compute_daily_metrics(uuid, public.environment_kind, date, date, timestamptz) to service_role;
grant execute on function private.mark_metric_day(uuid, uuid, public.environment_kind, date, text) to service_role;

comment on table public.daily_metrics is
  'Versioned acquisition-cohort rollups. Ratios are never stored: query_metric_rollups divides summed numerators by summed denominators.';
comment on column public.daily_metrics.uninstall_inferred is
  'Count of installations with an active uninstall inference; never a confirmed uninstall count.';
comment on column public.daily_metrics.data_through_at is
  'Upper observation timestamp used by the deterministic raw-data calculation.';

-- Existing demo rows predate the formal definitions. Rebuild them deterministically.
delete from public.daily_metrics;
update public.ad_costs cost
set environment = installation_environment.environment
from (
  select app_id, (array_agg(environment order by environment::text))[1] as environment
  from public.installations
  group by app_id
  having count(distinct environment) = 1
) installation_environment
where installation_environment.app_id = cost.app_id;

do $$
declare
  app_row record;
  min_date date;
  max_date date;
begin
  for app_row in
    select distinct app_id as id, environment from (
      select app_id, environment from public.installations
      union
      select app_id, environment from public.ad_costs
    ) app_environments
  loop
    select min(metric_date), max(metric_date) into min_date, max_date
    from (
      select (installation.first_open_at at time zone app.timezone)::date as metric_date
      from public.installations installation join public.apps app on app.id = installation.app_id
      where installation.app_id = app_row.id and installation.environment = app_row.environment
      union all
      select cost_date from public.ad_costs
      where app_id = app_row.id and environment = app_row.environment
    ) dates;
    if min_date is not null then
      perform set_config('request.jwt.claim.role', 'service_role', true);
      perform public.recalculate_daily_metrics(
        app_row.id,
        app_row.environment,
        min_date, max_date, 'metrics-v1', statement_timestamp()
      );
    end if;
  end loop;
end;
$$;
