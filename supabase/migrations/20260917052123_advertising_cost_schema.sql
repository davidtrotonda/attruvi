alter table public.connector_accounts
  drop constraint connector_accounts_provider,
  add constraint connector_accounts_provider
    check (provider in ('google_ads', 'meta_ads', 'tiktok_ads', 'manual'));

alter table public.connector_accounts
  add column if not exists account_name text,
  add column if not exists account_currency text,
  add column if not exists account_timezone text,
  add column if not exists api_version text,
  add column if not exists connection_state text not null default 'pending_credentials',
  add column if not exists token_expires_at timestamptz,
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_test_ok boolean,
  add column if not exists last_error_code text,
  add column if not exists last_error_at timestamptz,
  add column if not exists sync_overlap_days smallint not null default 3,
  add column if not exists sync_cursor jsonb not null default '{}'::jsonb;

alter table public.connector_accounts
  add constraint connector_accounts_currency_iso
    check (account_currency is null or account_currency ~ '^[A-Z]{3}$'),
  add constraint connector_accounts_connection_state
    check (connection_state in ('pending_credentials', 'ready', 'syncing', 'reconnect_required', 'error', 'disabled')),
  add constraint connector_accounts_overlap_range
    check (sync_overlap_days between 0 and 14),
  add constraint connector_accounts_api_version
    check (
      (provider = 'google_ads' and api_version in ('v25'))
      or (provider = 'meta_ads' and api_version in ('v26.0'))
      or (provider = 'tiktok_ads' and api_version in ('v1.3'))
      or (provider = 'manual' and api_version in ('manual-v1'))
      or api_version is null
    );

update public.connector_accounts
set external_account_hint = case
      when external_account_id is null then null
      else '····' || right(external_account_id, 4)
    end,
    connection_state = case when status = 'active' then 'ready' else 'disabled' end,
    api_version = case provider
      when 'google_ads' then 'v25'
      when 'meta_ads' then 'v26.0'
      when 'tiktok_ads' then 'v1.3'
      else api_version
    end
where external_account_hint is null or api_version is null;

create table private.connector_secrets (
  connector_account_id uuid primary key references public.connector_accounts (id) on delete cascade,
  encrypted_payload text not null,
  initialization_vector text not null,
  key_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connector_secrets_ciphertext_not_blank check (length(encrypted_payload) >= 24),
  constraint connector_secrets_iv_not_blank check (length(initialization_vector) >= 12)
);

revoke all on private.connector_secrets from public, anon, authenticated;

alter table public.connector_sync_runs
  add column if not exists attempt_count smallint not null default 0,
  add column if not exists max_attempts smallint not null default 5,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists pages_read integer not null default 0,
  add column if not exists overlap_days smallint not null default 3,
  add column if not exists api_version text,
  add column if not exists checkpoint jsonb not null default '{}'::jsonb,
  add column if not exists warning_count integer not null default 0;

alter table public.connector_sync_runs
  add constraint connector_sync_runs_attempts
    check (attempt_count >= 0 and max_attempts between 1 and 20 and attempt_count <= max_attempts),
  add constraint connector_sync_runs_pages
    check (pages_read >= 0 and warning_count >= 0),
  add constraint connector_sync_runs_overlap
    check (overlap_days between 0 and 14),
  add constraint connector_sync_runs_window
    check (sync_from is null or sync_to is null or sync_from <= sync_to);

create index connector_sync_runs_claim_idx
  on public.connector_sync_runs (next_attempt_at, created_at)
  where status in ('pending', 'retryable_failed');

create unique index connector_sync_runs_one_open_window_idx
  on public.connector_sync_runs (connector_account_id, sync_from, sync_to)
  where status in ('pending', 'running', 'retryable_failed');

alter table public.ad_costs
  add column if not exists sync_run_id uuid references public.connector_sync_runs (id) on delete set null,
  add column if not exists provider public.source_kind,
  add column if not exists external_account_id text,
  add column if not exists campaign_external_id text,
  add column if not exists campaign_name text,
  add column if not exists ad_group_external_id text,
  add column if not exists ad_group_name text,
  add column if not exists ad_external_id text,
  add column if not exists ad_name text,
  add column if not exists external_entity_status text not null default 'unknown',
  add column if not exists match_status text not null default 'unmatched',
  add column if not exists unmatched_reason text,
  add column if not exists correction_version integer not null default 1,
  add column if not exists provider_updated_at timestamptz,
  add column if not exists imported_at timestamptz not null default now();

update public.ad_costs cost
set provider = case
      when source.kind in ('google_ads', 'meta_ads', 'tiktok_ads') then source.kind
      else 'manual'::public.source_kind
    end,
    external_account_id = (
      select account.external_account_id
      from public.connector_accounts account
      where account.id = cost.connector_account_id
    ),
    match_status = case when cost.campaign_id is null then 'unmatched' else 'matched' end
from public.sources source
where source.id = cost.source_id
  and cost.provider is null;

alter table public.ad_costs
  alter column provider set not null,
  alter column provider set default 'manual',
  add constraint ad_costs_provider check (provider in ('google_ads', 'meta_ads', 'tiktok_ads', 'manual')),
  add constraint ad_costs_external_entity_status check (external_entity_status in ('active', 'paused', 'deleted', 'unknown')),
  add constraint ad_costs_match_status check (match_status in ('matched', 'partially_matched', 'unmatched', 'manual')),
  add constraint ad_costs_correction_version check (correction_version > 0);

create index ad_costs_sync_run_idx on public.ad_costs (sync_run_id) where sync_run_id is not null;
create index ad_costs_unmatched_idx
  on public.ad_costs (app_id, imported_at desc)
  where match_status in ('unmatched', 'partially_matched');
create index ad_costs_external_hierarchy_idx
  on public.ad_costs (connector_account_id, campaign_external_id, ad_group_external_id, ad_external_id, cost_date desc);

create table public.ad_cost_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  connector_account_id uuid not null,
  entity_kind text not null,
  external_id text not null,
  source_id uuid not null,
  campaign_id uuid,
  ad_group_id uuid,
  ad_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_cost_mappings_account_fk foreign key (connector_account_id, organization_id, app_id)
    references public.connector_accounts (id, organization_id, app_id) on delete cascade,
  constraint ad_cost_mappings_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint ad_cost_mappings_kind check (entity_kind in ('campaign', 'ad_group', 'ad')),
  constraint ad_cost_mappings_identity unique (connector_account_id, entity_kind, external_id)
);

create index ad_cost_mappings_org_app_idx on public.ad_cost_mappings (organization_id, app_id);
create index ad_cost_mappings_source_idx on public.ad_cost_mappings (source_id);
create index ad_cost_mappings_campaign_idx on public.ad_cost_mappings (campaign_id) where campaign_id is not null;
create index ad_cost_mappings_ad_group_idx on public.ad_cost_mappings (ad_group_id) where ad_group_id is not null;
create index ad_cost_mappings_ad_idx on public.ad_cost_mappings (ad_id) where ad_id is not null;

create trigger ad_cost_mappings_set_updated_at
before update on public.ad_cost_mappings
for each row execute function private.set_updated_at();

create trigger ad_cost_mappings_validate_hierarchy
before insert or update of organization_id, app_id, source_id, campaign_id, ad_group_id, ad_id
on public.ad_cost_mappings for each row execute function private.validate_marketing_hierarchy();

create or replace function public.store_connector_secret(
  requested_connector_account_id uuid,
  requested_encrypted_payload text,
  requested_initialization_vector text,
  requested_key_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.connector_secrets (
    connector_account_id, encrypted_payload, initialization_vector, key_version, updated_at
  ) values (
    requested_connector_account_id, requested_encrypted_payload, requested_initialization_vector, requested_key_version, now()
  )
  on conflict (connector_account_id) do update
  set encrypted_payload = excluded.encrypted_payload,
      initialization_vector = excluded.initialization_vector,
      key_version = excluded.key_version,
      updated_at = now();
  update public.connector_accounts
  set secret_reference = requested_connector_account_id::text,
      updated_at = now()
  where id = requested_connector_account_id;
end;
$$;

create or replace function public.read_connector_secret(requested_connector_account_id uuid)
returns table (encrypted_payload text, initialization_vector text, key_version text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select secret.encrypted_payload, secret.initialization_vector, secret.key_version
  from private.connector_secrets secret
  where secret.connector_account_id = requested_connector_account_id;
end;
$$;

create or replace function public.enqueue_connector_sync(
  requested_connector_account_id uuid,
  requested_from date default null,
  requested_to date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.connector_accounts%rowtype;
  effective_from date;
  sync_id uuid;
begin
  select * into account
  from public.connector_accounts
  where id = requested_connector_account_id;
  if not found or not (select private.has_organization_role(account.organization_id, array['owner', 'admin']::public.organization_role[])) then
    raise exception using errcode = '42501', message = 'connector account is unavailable';
  end if;
  if account.provider = 'manual' then
    raise exception using errcode = '22023', message = 'manual connector does not synchronize remotely';
  end if;
  if account.connection_state not in ('ready', 'error') then
    raise exception using errcode = '55000', message = 'connector is not ready';
  end if;
  effective_from := coalesce(
    requested_from,
    greatest((coalesce(account.last_synced_at, now())::date - account.sync_overlap_days), current_date - 90)
  );
  insert into public.connector_sync_runs (
    organization_id, app_id, connector_account_id, status, sync_from, sync_to,
    overlap_days, api_version, next_attempt_at
  ) values (
    account.organization_id, account.app_id, account.id, 'pending', effective_from,
    coalesce(requested_to, current_date), account.sync_overlap_days, account.api_version, now()
  )
  on conflict (connector_account_id, sync_from, sync_to)
    where status in ('pending', 'running', 'retryable_failed')
  do update set updated_at = now()
  returning id into sync_id;
  return sync_id;
end;
$$;

create or replace function public.claim_connector_sync_runs(worker_id text, batch_size integer default 5)
returns setof public.connector_sync_runs
language sql
security invoker
set search_path = ''
as $$
  with claimable as (
    select run.id
    from public.connector_sync_runs run
    join public.connector_accounts account on account.id = run.connector_account_id
    where run.status in ('pending', 'retryable_failed')
      and run.next_attempt_at <= now()
      and run.attempt_count < run.max_attempts
      and account.connection_state in ('ready', 'error')
    order by run.next_attempt_at, run.created_at
    limit greatest(1, least(batch_size, 25))
    for update of run skip locked
  )
  update public.connector_sync_runs run
  set status = 'running',
      attempt_count = run.attempt_count + 1,
      locked_at = now(),
      locked_by = worker_id,
      started_at = coalesce(run.started_at, now()),
      updated_at = now()
  from claimable
  where run.id = claimable.id
  returning run.*;
$$;

create or replace function public.persist_ad_cost_page(
  requested_connector_account_id uuid,
  requested_sync_run_id uuid,
  requested_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.connector_accounts%rowtype;
  row_data jsonb;
  linked_source_id uuid;
  linked_campaign_id uuid;
  linked_ad_group_id uuid;
  linked_ad_id uuid;
  matched_status text;
  written integer := 0;
  entity_record_status public.record_status;
  row_hash bytea;
begin
  if jsonb_typeof(requested_rows) <> 'array' or jsonb_array_length(requested_rows) > 1000 then
    raise exception using errcode = '22023', message = 'cost page must be an array of at most 1000 rows';
  end if;
  select * into account from public.connector_accounts where id = requested_connector_account_id;
  if not found or account.provider = 'manual' then
    raise exception using errcode = '22023', message = 'invalid remote connector account';
  end if;
  if not exists (
    select 1 from public.connector_sync_runs run
    where run.id = requested_sync_run_id and run.connector_account_id = account.id and run.status = 'running'
  ) then
    raise exception using errcode = '55000', message = 'sync run is not claimable';
  end if;

  select source.id into linked_source_id
  from public.sources source
  where source.app_id = account.app_id
    and source.kind = account.provider
    and source.external_id = account.external_account_id;
  if linked_source_id is null then
    insert into public.sources (organization_id, app_id, kind, name, external_id)
    values (
      account.organization_id, account.app_id, account.provider,
      coalesce(account.account_name, replace(account.provider::text, '_', ' ')), account.external_account_id
    )
    returning id into linked_source_id;
  end if;

  for row_data in select value from jsonb_array_elements(requested_rows)
  loop
    if coalesce(row_data->>'provider', '') <> account.provider::text
      or coalesce(row_data->>'accountExternalId', '') <> coalesce(account.external_account_id, '')
      or coalesce(row_data->>'currency', '') !~ '^[A-Z]{3}$'
      or coalesce(row_data->>'costDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or (row_data->>'amountMinor')::bigint < 0 then
      raise exception using errcode = '22023', message = 'invalid normalized cost row';
    end if;

    linked_campaign_id := null;
    linked_ad_group_id := null;
    linked_ad_id := null;
    entity_record_status := case row_data->>'entityStatus'
      when 'active' then 'active'::public.record_status
      when 'paused' then 'paused'::public.record_status
      when 'deleted' then 'disabled'::public.record_status
      else 'active'::public.record_status
    end;

    if nullif(row_data->>'campaignExternalId', '') is not null then
      select campaign.id into linked_campaign_id
      from public.campaigns campaign
      where campaign.app_id = account.app_id
        and campaign.source_id = linked_source_id
        and campaign.external_id = row_data->>'campaignExternalId';
      if linked_campaign_id is null then
        insert into public.campaigns (organization_id, app_id, source_id, name, external_id, status)
        values (
          account.organization_id, account.app_id, linked_source_id,
          coalesce(nullif(row_data->>'campaignName', ''), 'Campaña ' || right(row_data->>'campaignExternalId', 4)),
          row_data->>'campaignExternalId', entity_record_status
        ) returning id into linked_campaign_id;
      else
        update public.campaigns
        set name = coalesce(nullif(row_data->>'campaignName', ''), name), status = entity_record_status, updated_at = now()
        where id = linked_campaign_id;
      end if;
    end if;

    if linked_campaign_id is not null and nullif(row_data->>'adGroupExternalId', '') is not null then
      select ad_group.id into linked_ad_group_id
      from public.ad_groups ad_group
      where ad_group.app_id = account.app_id
        and ad_group.campaign_id = linked_campaign_id
        and ad_group.external_id = row_data->>'adGroupExternalId';
      if linked_ad_group_id is null then
        insert into public.ad_groups (organization_id, app_id, source_id, campaign_id, name, external_id, status)
        values (
          account.organization_id, account.app_id, linked_source_id, linked_campaign_id,
          coalesce(nullif(row_data->>'adGroupName', ''), 'Grupo ' || right(row_data->>'adGroupExternalId', 4)),
          row_data->>'adGroupExternalId', entity_record_status
        ) returning id into linked_ad_group_id;
      else
        update public.ad_groups
        set name = coalesce(nullif(row_data->>'adGroupName', ''), name), status = entity_record_status, updated_at = now()
        where id = linked_ad_group_id;
      end if;
    end if;

    if linked_ad_group_id is not null and nullif(row_data->>'adExternalId', '') is not null then
      select ad.id into linked_ad_id
      from public.ads ad
      where ad.app_id = account.app_id
        and ad.ad_group_id = linked_ad_group_id
        and ad.external_id = row_data->>'adExternalId';
      if linked_ad_id is null then
        insert into public.ads (organization_id, app_id, source_id, campaign_id, ad_group_id, name, external_id, status)
        values (
          account.organization_id, account.app_id, linked_source_id, linked_campaign_id, linked_ad_group_id,
          coalesce(nullif(row_data->>'adName', ''), 'Anuncio ' || right(row_data->>'adExternalId', 4)),
          row_data->>'adExternalId', entity_record_status
        ) returning id into linked_ad_id;
      else
        update public.ads
        set name = coalesce(nullif(row_data->>'adName', ''), name), status = entity_record_status, updated_at = now()
        where id = linked_ad_id;
      end if;
    end if;

    matched_status := case
      when nullif(row_data->>'campaignExternalId', '') is not null and linked_campaign_id is null then 'unmatched'
      when nullif(row_data->>'adGroupExternalId', '') is not null and linked_ad_group_id is null then 'partially_matched'
      when nullif(row_data->>'adExternalId', '') is not null and linked_ad_id is null then 'partially_matched'
      else 'matched'
    end;
    row_hash := decode(md5(row_data::text), 'hex');

    insert into public.ad_costs (
      organization_id, app_id, connector_account_id, sync_run_id, source_id,
      campaign_id, ad_group_id, ad_id, provider, external_account_id,
      campaign_external_id, campaign_name, ad_group_external_id, ad_group_name,
      ad_external_id, ad_name, cost_date, amount_minor, currency, impressions,
      clicks, external_row_id, data_hash, external_entity_status, match_status,
      unmatched_reason, provider_updated_at, imported_at
    ) values (
      account.organization_id, account.app_id, account.id, requested_sync_run_id, linked_source_id,
      linked_campaign_id, linked_ad_group_id, linked_ad_id, account.provider, account.external_account_id,
      nullif(row_data->>'campaignExternalId', ''), nullif(row_data->>'campaignName', ''),
      nullif(row_data->>'adGroupExternalId', ''), nullif(row_data->>'adGroupName', ''),
      nullif(row_data->>'adExternalId', ''), nullif(row_data->>'adName', ''),
      (row_data->>'costDate')::date, (row_data->>'amountMinor')::bigint, row_data->>'currency',
      coalesce((row_data->>'impressions')::bigint, 0), coalesce((row_data->>'clicks')::bigint, 0),
      row_data->>'externalRowId', row_hash, row_data->>'entityStatus', matched_status,
      case when matched_status = 'matched' then null else 'No se encontró toda la jerarquía externa' end,
      nullif(row_data->>'providerUpdatedAt', '')::timestamptz, now()
    )
    on conflict (app_id, connector_account_id, cost_date, external_row_id) do update
    set sync_run_id = excluded.sync_run_id,
        source_id = excluded.source_id,
        campaign_id = excluded.campaign_id,
        ad_group_id = excluded.ad_group_id,
        ad_id = excluded.ad_id,
        amount_minor = excluded.amount_minor,
        currency = excluded.currency,
        impressions = excluded.impressions,
        clicks = excluded.clicks,
        data_hash = excluded.data_hash,
        campaign_name = excluded.campaign_name,
        ad_group_name = excluded.ad_group_name,
        ad_name = excluded.ad_name,
        external_entity_status = excluded.external_entity_status,
        match_status = excluded.match_status,
        unmatched_reason = excluded.unmatched_reason,
        correction_version = case
          when public.ad_costs.data_hash is distinct from excluded.data_hash then public.ad_costs.correction_version + 1
          else public.ad_costs.correction_version
        end,
        provider_updated_at = excluded.provider_updated_at,
        imported_at = now(),
        updated_at = now();
    written := written + 1;
  end loop;

  update public.connector_sync_runs
  set rows_read = rows_read + jsonb_array_length(requested_rows),
      rows_written = rows_written + written,
      pages_read = pages_read + 1,
      updated_at = now()
  where id = requested_sync_run_id;
  return written;
end;
$$;

create or replace function public.upsert_manual_ad_costs(requested_app_id uuid, requested_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_app public.apps%rowtype;
  manual_source_id uuid;
  manual_account_id uuid;
  row_data jsonb;
  written integer := 0;
  row_hash bytea;
begin
  select * into target_app from public.apps where id = requested_app_id;
  if not found or not (select private.has_organization_role(target_app.organization_id, array['owner', 'admin']::public.organization_role[])) then
    raise exception using errcode = '42501', message = 'app is unavailable';
  end if;
  if jsonb_typeof(requested_rows) <> 'array' or jsonb_array_length(requested_rows) > 1000 then
    raise exception using errcode = '22023', message = 'manual cost payload must contain at most 1000 rows';
  end if;

  select id into manual_source_id from public.sources
  where app_id = target_app.id and kind = 'manual' and name = 'Coste manual';
  if manual_source_id is null then
    insert into public.sources (organization_id, app_id, kind, name, external_id)
    values (target_app.organization_id, target_app.id, 'manual', 'Coste manual', 'manual')
    returning id into manual_source_id;
  end if;
  select id into manual_account_id from public.connector_accounts
  where app_id = target_app.id and provider = 'manual' and external_account_id = 'manual';
  if manual_account_id is null then
    insert into public.connector_accounts (
      organization_id, app_id, provider, external_account_id, external_account_hint,
      account_name, account_currency, api_version, connection_state, status
    ) values (
      target_app.organization_id, target_app.id, 'manual', 'manual', 'Manual',
      'Costes manuales', target_app.currency, 'manual-v1', 'ready', 'active'
    ) returning id into manual_account_id;
  end if;

  for row_data in select value from jsonb_array_elements(requested_rows)
  loop
    if coalesce(row_data->>'currency', '') !~ '^[A-Z]{3}$'
      or coalesce(row_data->>'costDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or (row_data->>'amountMinor')::bigint < 0
      or nullif(row_data->>'externalRowId', '') is null then
      raise exception using errcode = '22023', message = 'invalid manual cost row';
    end if;
    row_hash := decode(md5(row_data::text), 'hex');
    insert into public.ad_costs (
      organization_id, app_id, connector_account_id, source_id, provider, external_account_id,
      campaign_external_id, campaign_name, ad_group_external_id, ad_group_name,
      ad_external_id, ad_name, cost_date, amount_minor, currency, impressions, clicks,
      external_row_id, data_hash, external_entity_status, match_status, unmatched_reason, imported_at
    ) values (
      target_app.organization_id, target_app.id, manual_account_id, manual_source_id, 'manual', 'manual',
      nullif(row_data->>'campaignExternalId', ''), nullif(row_data->>'campaignName', ''),
      nullif(row_data->>'adGroupExternalId', ''), nullif(row_data->>'adGroupName', ''),
      nullif(row_data->>'adExternalId', ''), nullif(row_data->>'adName', ''),
      (row_data->>'costDate')::date, (row_data->>'amountMinor')::bigint, row_data->>'currency',
      coalesce((row_data->>'impressions')::bigint, 0), coalesce((row_data->>'clicks')::bigint, 0),
      row_data->>'externalRowId', row_hash, 'active',
      case when nullif(row_data->>'campaignExternalId', '') is null then 'manual' else 'unmatched' end,
      case when nullif(row_data->>'campaignExternalId', '') is null then null else 'Asigna la campaña si quieres combinar este coste con atribución' end,
      now()
    )
    on conflict (app_id, connector_account_id, cost_date, external_row_id) do update
    set amount_minor = excluded.amount_minor,
        currency = excluded.currency,
        impressions = excluded.impressions,
        clicks = excluded.clicks,
        campaign_external_id = excluded.campaign_external_id,
        campaign_name = excluded.campaign_name,
        ad_group_external_id = excluded.ad_group_external_id,
        ad_group_name = excluded.ad_group_name,
        ad_external_id = excluded.ad_external_id,
        ad_name = excluded.ad_name,
        data_hash = excluded.data_hash,
        match_status = excluded.match_status,
        unmatched_reason = excluded.unmatched_reason,
        correction_version = case
          when public.ad_costs.data_hash is distinct from excluded.data_hash then public.ad_costs.correction_version + 1
          else public.ad_costs.correction_version
        end,
        imported_at = now(),
        updated_at = now();
    written := written + 1;
  end loop;
  return written;
end;
$$;

create or replace function public.assign_ad_cost_campaign(requested_cost_id uuid, requested_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_cost public.ad_costs%rowtype;
  target_campaign public.campaigns%rowtype;
  affected integer;
begin
  select * into target_cost from public.ad_costs where id = requested_cost_id;
  if not found or not (select private.has_organization_role(target_cost.organization_id, array['owner', 'admin']::public.organization_role[])) then
    raise exception using errcode = '42501', message = 'cost is unavailable';
  end if;
  select * into target_campaign from public.campaigns where id = requested_campaign_id;
  if not found or target_campaign.organization_id <> target_cost.organization_id or target_campaign.app_id <> target_cost.app_id then
    raise exception using errcode = '23514', message = 'campaign does not belong to cost app';
  end if;
  if target_cost.campaign_external_id is null then
    raise exception using errcode = '22023', message = 'cost has no external campaign id';
  end if;
  insert into public.ad_cost_mappings (
    organization_id, app_id, connector_account_id, entity_kind, external_id,
    source_id, campaign_id, created_by
  ) values (
    target_cost.organization_id, target_cost.app_id, target_cost.connector_account_id,
    'campaign', target_cost.campaign_external_id, target_campaign.source_id,
    target_campaign.id, auth.uid()
  )
  on conflict (connector_account_id, entity_kind, external_id) do update
  set source_id = excluded.source_id,
      campaign_id = excluded.campaign_id,
      ad_group_id = null,
      ad_id = null,
      created_by = excluded.created_by,
      updated_at = now();

  update public.ad_costs
  set source_id = target_campaign.source_id,
      campaign_id = target_campaign.id,
      ad_group_id = null,
      ad_id = null,
      match_status = case
        when ad_group_external_id is not null or ad_external_id is not null then 'partially_matched'
        else 'matched'
      end,
      unmatched_reason = case
        when ad_group_external_id is not null or ad_external_id is not null then 'Campaña asignada; grupo o anuncio sigue sin relacionar'
        else null
      end,
      updated_at = now()
  where connector_account_id = target_cost.connector_account_id
    and campaign_external_id = target_cost.campaign_external_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.store_connector_secret(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.read_connector_secret(uuid) from public, anon, authenticated;
revoke all on function public.claim_connector_sync_runs(text, integer) from public, anon, authenticated;
revoke all on function public.persist_ad_cost_page(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.store_connector_secret(uuid, text, text, text) to service_role;
grant execute on function public.read_connector_secret(uuid) to service_role;
grant execute on function public.claim_connector_sync_runs(text, integer) to service_role;
grant execute on function public.persist_ad_cost_page(uuid, uuid, jsonb) to service_role;

revoke all on function public.enqueue_connector_sync(uuid, date, date) from public, anon;
revoke all on function public.upsert_manual_ad_costs(uuid, jsonb) from public, anon;
revoke all on function public.assign_ad_cost_campaign(uuid, uuid) from public, anon;
grant execute on function public.enqueue_connector_sync(uuid, date, date) to authenticated;
grant execute on function public.upsert_manual_ad_costs(uuid, jsonb) to authenticated;
grant execute on function public.assign_ad_cost_campaign(uuid, uuid) to authenticated;

revoke all on public.ad_cost_mappings from anon, authenticated;
grant select on public.ad_cost_mappings to authenticated;
grant all on public.ad_cost_mappings to service_role;
alter table public.ad_cost_mappings enable row level security;
create policy tenant_members_can_read on public.ad_cost_mappings
for select to authenticated
using ((select private.is_organization_member(organization_id)));

comment on table private.connector_secrets is
  'AES-GCM ciphertext only. The encryption key is held by the server environment, never Postgres or the browser.';
comment on table public.ad_costs is
  'Daily immutable-key cost facts. Corrected provider data updates the same external row and increments correction_version; original currency is never converted implicitly.';
comment on table public.ad_cost_mappings is
  'Auditable manual mappings for external campaign/ad group/ad identifiers that could not be matched automatically.';
