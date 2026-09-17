alter table public.connector_accounts
  add column login_customer_id text;

alter table public.postback_destinations
  add column connector_account_id uuid,
  add column provider_mode text,
  add column provider_event_name text,
  add column value_mode text not null default 'event',
  add column currency_mode text not null default 'event',
  add column fixed_value_minor bigint,
  add column fixed_currency text,
  add column api_version text,
  add column test_event_code text,
  add column last_tested_at timestamptz,
  add column last_test_status text,
  add column last_test_error_code text;

update public.postback_destinations
set provider_mode = case provider
      when 'google_ads' then 'google_click_conversion'
      when 'meta_ads' then 'meta_conversions_api'
      when 'tiktok_ads' then 'tiktok_events_api_v2'
    end,
    provider_event_name = coalesce(nullif(event_name, ''), 'purchase'),
    api_version = case provider
      when 'google_ads' then 'v25'
      when 'meta_ads' then 'v26.0'
      when 'tiktok_ads' then 'v1.3'
    end;

alter table public.postback_destinations
  alter column provider_mode set not null,
  alter column provider_event_name set not null,
  alter column api_version set not null,
  add constraint postback_destinations_connector_fk
    foreign key (connector_account_id, organization_id, app_id)
    references public.connector_accounts (id, organization_id, app_id) on delete set null (connector_account_id),
  add constraint postback_destinations_provider_mode check (
    (provider = 'google_ads' and provider_mode = 'google_click_conversion' and api_version = 'v25')
    or (provider = 'meta_ads' and provider_mode = 'meta_conversions_api' and api_version = 'v26.0')
    or (provider = 'tiktok_ads' and provider_mode = 'tiktok_events_api_v2' and api_version = 'v1.3')
  ),
  add constraint postback_destinations_value_mode check (value_mode in ('event', 'none', 'fixed')),
  add constraint postback_destinations_currency_mode check (currency_mode in ('event', 'app', 'fixed')),
  add constraint postback_destinations_fixed_value check (
    (value_mode = 'fixed' and fixed_value_minor is not null)
    or (value_mode <> 'fixed' and fixed_value_minor is null)
  ),
  add constraint postback_destinations_fixed_currency check (
    (currency_mode = 'fixed' and fixed_currency ~ '^[A-Z]{3}$')
    or (currency_mode <> 'fixed' and fixed_currency is null)
  ),
  add constraint postback_destinations_event_names check (
    char_length(event_name) between 1 and 80
    and char_length(provider_event_name) between 1 and 120
  ),
  add constraint postback_destinations_test_status check (
    last_test_status is null or last_test_status in ('succeeded', 'failed', 'local_validation')
  );

create index postback_destinations_connector_idx
  on public.postback_destinations (connector_account_id)
  where connector_account_id is not null;

alter table public.postback_jobs
  add column max_attempts smallint not null default 8,
  add column processing_started_at timestamptz,
  add column provider_event_id text,
  add column provider_request_id text,
  add column last_http_status smallint,
  add column latency_ms integer,
  add column skip_reason text,
  add column dead_lettered_at timestamptz,
  add column replayed_from_job_id uuid references public.postback_jobs (id) on delete set null,
  add column replay_count smallint not null default 0;

update public.postback_jobs job
set provider_event_id = event.event_id::text
from public.events event
where event.id = job.event_id
  and job.provider_event_id is null;

alter table public.postback_jobs
  alter column provider_event_id set not null,
  add constraint postback_jobs_attempt_limits check (
    max_attempts between 1 and 20 and attempt_count between 0 and max_attempts
  ),
  add constraint postback_jobs_http_status check (last_http_status is null or last_http_status between 100 and 599),
  add constraint postback_jobs_latency check (latency_ms is null or latency_ms >= 0),
  add constraint postback_jobs_replay_count check (replay_count between 0 and 100),
  add constraint postback_jobs_skip_shape check (
    (status = 'skipped' and skip_reason is not null)
    or status <> 'skipped'
  );

create index postback_jobs_replayed_from_idx
  on public.postback_jobs (replayed_from_job_id)
  where replayed_from_job_id is not null;
create index postback_jobs_destination_created_idx
  on public.postback_jobs (destination_id, created_at desc);

alter table public.postback_attempts
  add column retry_after_seconds integer,
  add column request_metadata jsonb not null default '{}'::jsonb;

alter table public.postback_attempts
  add constraint postback_attempts_retry_after check (retry_after_seconds is null or retry_after_seconds between 1 and 86400),
  add constraint postback_attempts_request_metadata check (jsonb_typeof(request_metadata) = 'object'),
  add constraint postback_attempts_excerpt_length check (response_excerpt is null or char_length(response_excerpt) <= 600);

create or replace function private.validate_postback_destination_connector()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account_provider public.source_kind;
begin
  if new.connector_account_id is null then
    return new;
  end if;
  select account.provider into account_provider
  from public.connector_accounts account
  where account.id = new.connector_account_id
    and account.organization_id = new.organization_id
    and account.app_id = new.app_id;
  if account_provider is null or account_provider <> new.provider then
    raise exception using errcode = '23514', message = 'postback connector provider does not match destination';
  end if;
  return new;
end;
$$;

create trigger postback_destinations_validate_connector
before insert or update of connector_account_id, provider, organization_id, app_id
on public.postback_destinations
for each row execute function private.validate_postback_destination_connector();

create or replace function private.enqueue_event_postbacks()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.postback_jobs (
    organization_id, app_id, destination_id, event_id, idempotency_key,
    provider_event_id, status, payload, next_attempt_at
  )
  select
    new.organization_id,
    new.app_id,
    destination.id,
    new.id,
    new.event_id::text,
    new.event_id::text,
    'pending'::public.job_status,
    jsonb_build_object('schemaVersion', 1),
    now()
  from public.postback_destinations destination
  where destination.organization_id = new.organization_id
    and destination.app_id = new.app_id
    and destination.event_name = new.name
    and destination.status = 'active'
  on conflict (destination_id, idempotency_key) do nothing;
  return new;
end;
$$;

create trigger events_enqueue_postbacks
after insert on public.events
for each row execute function private.enqueue_event_postbacks();

create or replace function public.claim_postback_jobs(worker_id text, batch_size integer default 50)
returns setof public.postback_jobs
language sql
security invoker
set search_path = ''
as $$
  with claimable as (
    select job.id
    from public.postback_jobs job
    join public.postback_destinations destination on destination.id = job.destination_id
    where (
        (job.status in ('pending', 'retryable_failed') and job.next_attempt_at <= now())
        or (job.status = 'processing' and job.locked_at < now() - interval '15 minutes')
      )
      and job.attempt_count < job.max_attempts
      and destination.status = 'active'
    order by job.next_attempt_at, job.created_at
    limit greatest(1, least(batch_size, 500))
    for update of job skip locked
  )
  update public.postback_jobs job
  set status = 'processing',
      attempt_count = job.attempt_count + 1,
      locked_at = now(),
      locked_by = worker_id,
      processing_started_at = now(),
      updated_at = now()
  from claimable
  where job.id = claimable.id
  returning job.*;
$$;

revoke all on function public.claim_postback_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.claim_postback_jobs(text, integer) to service_role;

create or replace function public.complete_postback_job(
  requested_job_id uuid,
  requested_worker_id text,
  requested_status public.job_status,
  requested_http_status integer default null,
  requested_provider_error_code text default null,
  requested_provider_request_id text default null,
  requested_response_excerpt text default null,
  requested_duration_ms integer default null,
  requested_retry_after_seconds integer default null,
  requested_next_attempt_at timestamptz default null,
  requested_skip_reason text default null,
  requested_request_metadata jsonb default '{}'::jsonb
)
returns public.postback_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  job public.postback_jobs%rowtype;
  final_status public.job_status;
  finished_at timestamptz;
begin
  if requested_status not in ('succeeded', 'retryable_failed', 'permanently_failed', 'skipped') then
    raise exception using errcode = '22023', message = 'invalid postback completion status';
  end if;
  if requested_response_excerpt is not null and char_length(requested_response_excerpt) > 600 then
    raise exception using errcode = '22023', message = 'response excerpt is too long';
  end if;
  if jsonb_typeof(requested_request_metadata) <> 'object' then
    raise exception using errcode = '22023', message = 'request metadata must be an object';
  end if;
  select * into job from public.postback_jobs
  where id = requested_job_id and status = 'processing' and locked_by = requested_worker_id
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'postback job is not owned by this worker';
  end if;
  final_status := requested_status;
  if final_status = 'retryable_failed' and job.attempt_count >= job.max_attempts then
    final_status := 'permanently_failed';
  end if;
  if final_status = 'skipped' and nullif(requested_skip_reason, '') is null then
    raise exception using errcode = '22023', message = 'skipped jobs require a reason';
  end if;
  finished_at := case when final_status in ('succeeded', 'permanently_failed', 'skipped') then now() else null end;
  insert into public.postback_attempts (
    organization_id, app_id, postback_job_id, attempt_number, status, http_status,
    provider_error_code, response_excerpt, duration_ms, retry_after_seconds, request_metadata
  ) values (
    job.organization_id, job.app_id, job.id, job.attempt_count, final_status,
    requested_http_status, left(requested_provider_error_code, 120), left(requested_response_excerpt, 600),
    requested_duration_ms, requested_retry_after_seconds, requested_request_metadata
  );
  update public.postback_jobs
  set status = final_status,
      next_attempt_at = case when final_status = 'retryable_failed' then coalesce(requested_next_attempt_at, now() + interval '1 minute') else next_attempt_at end,
      locked_at = null,
      locked_by = null,
      provider_request_id = left(requested_provider_request_id, 160),
      last_http_status = requested_http_status,
      latency_ms = requested_duration_ms,
      last_error_code = case when final_status = 'succeeded' then null else left(requested_provider_error_code, 120) end,
      skip_reason = case when final_status = 'skipped' then left(requested_skip_reason, 160) else null end,
      completed_at = finished_at,
      dead_lettered_at = case when final_status = 'permanently_failed' then now() else null end,
      updated_at = now()
  where id = job.id
  returning * into job;
  return job;
end;
$$;

revoke all on function public.complete_postback_job(uuid, text, public.job_status, integer, text, text, text, integer, integer, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_postback_job(uuid, text, public.job_status, integer, text, text, text, integer, integer, timestamptz, text, jsonb) to service_role;

create or replace function public.replay_postback_job(requested_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  original public.postback_jobs%rowtype;
  replay_id uuid;
  next_replay smallint;
begin
  select * into original from public.postback_jobs where id = requested_job_id for update;
  if not found or not (select private.has_organization_role(original.organization_id, array['owner', 'admin']::public.organization_role[])) then
    raise exception using errcode = '42501', message = 'postback job is unavailable';
  end if;
  if original.status not in ('retryable_failed', 'permanently_failed', 'skipped') then
    raise exception using errcode = '55000', message = 'only failed or skipped postbacks can be replayed';
  end if;
  next_replay := original.replay_count + 1;
  if next_replay > 100 then
    raise exception using errcode = '54000', message = 'postback replay limit reached';
  end if;
  update public.postback_jobs set replay_count = next_replay, updated_at = now() where id = original.id;
  insert into public.postback_jobs (
    organization_id, app_id, destination_id, event_id, idempotency_key, status,
    payload, provider_event_id, replayed_from_job_id, next_attempt_at
  ) values (
    original.organization_id, original.app_id, original.destination_id, original.event_id,
    original.idempotency_key || ':replay:' || next_replay::text, 'pending',
    original.payload, original.provider_event_id, original.id, now()
  ) returning id into replay_id;
  insert into public.audit_log (
    organization_id, app_id, actor_user_id, actor_kind, action, target_table,
    target_id, before_state, after_state
  ) values (
    original.organization_id, original.app_id, auth.uid(), 'user', 'postback.replayed',
    'postback_jobs', replay_id,
    jsonb_build_object('source_job_id', original.id, 'source_status', original.status),
    jsonb_build_object('status', 'pending', 'replay_number', next_replay)
  );
  return replay_id;
end;
$$;

revoke all on function public.replay_postback_job(uuid) from public, anon;
grant execute on function public.replay_postback_job(uuid) to authenticated;

create or replace function public.get_postback_dashboard_summary(requested_app_id uuid)
returns table (
  total bigint,
  pending bigint,
  processing bigint,
  succeeded bigint,
  retryable_failed bigint,
  permanently_failed bigint,
  skipped bigint,
  success_rate numeric,
  average_latency_ms numeric,
  p95_latency_ms numeric,
  last_sent_at timestamptz,
  errors jsonb
)
language sql
security invoker
set search_path = ''
as $$
  with totals as (
    select
      count(*) total,
      count(*) filter (where job.status = 'pending') pending,
      count(*) filter (where job.status = 'processing') processing,
      count(*) filter (where job.status = 'succeeded') succeeded,
      count(*) filter (where job.status = 'retryable_failed') retryable_failed,
      count(*) filter (where job.status = 'permanently_failed') permanently_failed,
      count(*) filter (where job.status = 'skipped') skipped,
      round(100 * count(*) filter (where job.status = 'succeeded')::numeric / nullif(count(*) filter (where job.status in ('succeeded', 'permanently_failed')), 0), 2) success_rate,
      round(avg(job.latency_ms) filter (where job.latency_ms is not null), 0) average_latency_ms,
      round(percentile_cont(0.95) within group (order by job.latency_ms) filter (where job.latency_ms is not null)) p95_latency_ms,
      max(job.completed_at) filter (where job.status = 'succeeded') last_sent_at
    from public.postback_jobs job
    where job.app_id = requested_app_id
  ), errors as (
    select coalesce(jsonb_agg(jsonb_build_object('code', ranked.code, 'count', ranked.count) order by ranked.count desc), '[]'::jsonb) value
    from (
      select job.last_error_code code, count(*) count
      from public.postback_jobs job
      where job.app_id = requested_app_id and job.last_error_code is not null
      group by job.last_error_code
      order by count(*) desc
      limit 8
    ) ranked
  )
  select totals.*, errors.value from totals cross join errors;
$$;

revoke all on function public.get_postback_dashboard_summary(uuid) from public, anon;
grant execute on function public.get_postback_dashboard_summary(uuid) to authenticated;

revoke all on function private.validate_postback_destination_connector() from public, anon, authenticated;
revoke all on function private.enqueue_event_postbacks() from public, anon, authenticated;

comment on column public.postback_jobs.provider_event_id is
  'Stable event identifier reused across retries and audited replays so providers can deduplicate.';
comment on column public.postback_jobs.payload is
  'Non-sensitive outbox metadata only. Provider payloads are built just-in-time from authoritative rows and are never persisted here.';
comment on table public.postback_attempts is
  'Redacted delivery metadata only. Tokens, click identifiers, full requests and raw provider responses must never be stored.';
