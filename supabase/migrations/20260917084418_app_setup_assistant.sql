-- Per-app setup assistant and development-only trace stream.
-- Readable SDK keys are never stored: only SHA-256 plus a visible prefix.

create table public.development_debug_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  stage text not null,
  status text not null,
  title text not null,
  detail text not null,
  request_id uuid,
  installation_id uuid,
  event_id uuid,
  postback_job_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  constraint development_debug_events_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint development_debug_events_stage check (
    stage in ('click', 'validation', 'queue', 'first_open', 'attribution', 'event', 'postback')
  ),
  constraint development_debug_events_status check (
    status in ('waiting', 'valid', 'queued', 'persisted', 'attributed', 'received', 'dry_run', 'warning', 'failed')
  ),
  constraint development_debug_events_title_length check (char_length(title) between 1 and 120),
  constraint development_debug_events_detail_length check (char_length(detail) between 1 and 500),
  constraint development_debug_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index development_debug_events_app_time_idx
  on public.development_debug_events (app_id, occurred_at desc, id desc);
create index development_debug_events_installation_time_idx
  on public.development_debug_events (installation_id, occurred_at desc)
  where installation_id is not null;
create index development_debug_events_event_idx
  on public.development_debug_events (event_id)
  where event_id is not null;
create index development_debug_events_actor_rate_idx
  on public.development_debug_events (actor_user_id, occurred_at desc)
  where actor_user_id is not null;

comment on table public.development_debug_events is
  'Sanitized, development-only setup traces. Retain for seven days; never store event properties, credentials, raw user identifiers, IP addresses, or user agents.';

alter table public.development_debug_events enable row level security;
revoke all on public.development_debug_events from public, anon, authenticated;
grant select on public.development_debug_events to authenticated;
grant all on public.development_debug_events to service_role;

create policy development_debug_events_member_read
on public.development_debug_events for select to authenticated
using ((select private.is_organization_member(organization_id)));

create or replace function public.create_public_sdk_key(
  requested_app_id uuid,
  requested_environment public.environment_kind,
  requested_key_hash text,
  requested_visible_prefix text,
  rotate_existing boolean default false
)
returns table (
  sdk_key_id uuid,
  visible_prefix text,
  environment public.environment_kind,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_organization_id uuid;
  inserted_key_id uuid;
  inserted_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if requested_key_hash !~ '^[a-f0-9]{64}$'
    or char_length(requested_visible_prefix) not between 8 and 32 then
    raise exception 'invalid_sdk_key_material' using errcode = '22023';
  end if;

  select app.organization_id into requested_organization_id
  from public.apps app
  where app.id = requested_app_id;

  if requested_organization_id is null
    or not private.has_organization_role(
      requested_organization_id,
      array['owner', 'admin']::public.organization_role[]
    ) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  if rotate_existing then
    update public.public_sdk_keys sdk_key
    set status = 'revoked',
        revoked_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where sdk_key.app_id = requested_app_id
      and sdk_key.environment = requested_environment
      and sdk_key.status = 'active';
  elsif exists (
    select 1 from public.public_sdk_keys sdk_key
    where sdk_key.app_id = requested_app_id
      and sdk_key.environment = requested_environment
      and sdk_key.status = 'active'
  ) then
    raise exception 'active_sdk_key_exists' using errcode = '23505';
  end if;

  insert into public.public_sdk_keys (
    organization_id, app_id, key_hash, visible_prefix, environment,
    status, created_by
  ) values (
    requested_organization_id,
    requested_app_id,
    pg_catalog.decode(requested_key_hash, 'hex'),
    requested_visible_prefix,
    requested_environment,
    'active',
    (select auth.uid())
  )
  returning id, public.public_sdk_keys.created_at into inserted_key_id, inserted_at;

  insert into public.audit_log (
    organization_id, app_id, actor_user_id, actor_kind, action,
    target_table, target_id, after_state
  ) values (
    requested_organization_id,
    requested_app_id,
    (select auth.uid()),
    'user',
    case when rotate_existing then 'sdk_key.rotated' else 'sdk_key.created' end,
    'public_sdk_keys',
    inserted_key_id,
    jsonb_build_object('environment', requested_environment, 'visible_prefix', requested_visible_prefix)
  );

  return query select inserted_key_id, requested_visible_prefix, requested_environment, inserted_at;
end;
$$;

revoke all on function public.create_public_sdk_key(uuid, public.environment_kind, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.create_public_sdk_key(uuid, public.environment_kind, text, text, boolean)
  to authenticated;

create or replace function private.trace_development_installation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.environment <> 'development' then return new; end if;
  insert into public.development_debug_events (
    organization_id, app_id, stage, status, title, detail,
    installation_id, metadata, occurred_at
  ) values
  (
    new.organization_id, new.app_id, 'validation', 'valid',
    'Payload validado', 'La appKey, el formato y el entorno de desarrollo son válidos.',
    new.id, jsonb_build_object('platform', new.platform, 'sdkVersion', coalesce(new.sdk_version, 'desconocida')),
    new.first_open_at
  ),
  (
    new.organization_id, new.app_id, 'queue', 'persisted',
    'Cola procesada', 'La primera apertura salió de la cola y quedó guardada sin duplicados.',
    new.id, jsonb_build_object('platform', new.platform), new.first_open_at
  ),
  (
    new.organization_id, new.app_id, 'first_open', 'received',
    'Primera apertura recibida', 'Attruvi ha creado una instalación anónima en development.',
    new.id, jsonb_build_object('platform', new.platform), new.first_open_at
  );
  return new;
end;
$$;

create trigger installations_development_debug_trace
after insert on public.installations
for each row execute function private.trace_development_installation();

create or replace function private.trace_development_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.installations installation
    where installation.id = new.installation_id
      and installation.app_id = new.app_id
      and installation.environment = 'development'
  ) then return new; end if;

  insert into public.development_debug_events (
    organization_id, app_id, stage, status, title, detail,
    installation_id, event_id, metadata, occurred_at
  ) values (
    new.organization_id, new.app_id, 'event', 'received',
    'Evento recibido', 'El evento ' || new.name || ' se validó y guardó sin incluir sus propiedades.',
    new.installation_id, new.id, jsonb_build_object('eventName', new.name), new.received_at
  );
  return new;
end;
$$;

create trigger events_development_debug_trace
after insert on public.events
for each row execute function private.trace_development_event();

create or replace function private.trace_development_attribution()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.installations installation
    where installation.id = new.installation_id
      and installation.app_id = new.app_id
      and installation.environment = 'development'
  ) then return new; end if;

  insert into public.development_debug_events (
    organization_id, app_id, stage, status, title, detail,
    installation_id, metadata, occurred_at
  ) values (
    new.organization_id, new.app_id, 'attribution', 'attributed',
    'Atribución calculada',
    case when new.match_type = 'organic'
      then 'No había una señal publicitaria válida: la instalación quedó como orgánica.'
      else 'La instalación se relacionó mediante ' || replace(new.match_type::text, '_', ' ') || '.'
    end,
    new.installation_id,
    jsonb_build_object('matchType', new.match_type, 'confidence', new.confidence, 'ruleVersion', new.rule_version),
    new.attributed_at
  );
  return new;
end;
$$;

create trigger attributions_development_debug_trace
after insert or update of match_type, confidence on public.attributions
for each row execute function private.trace_development_attribution();

create or replace function private.trace_test_link_click()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not new.is_test then return new; end if;
  insert into public.development_debug_events (
    organization_id, app_id, stage, status, title, detail,
    request_id, metadata, occurred_at
  ) values (
    new.organization_id, new.app_id, 'click', 'received',
    'Clic de prueba recibido', 'El enlace resolvió el destino sin mostrar una pantalla intermedia.',
    new.request_id,
    jsonb_build_object('platform', coalesce(new.destination_platform, new.platform_hint, 'desconocida')),
    new.clicked_at
  );
  return new;
end;
$$;

create trigger link_clicks_development_debug_trace
after insert on public.link_clicks
for each row execute function private.trace_test_link_click();

-- Development events are never eligible for an external provider call. They still
-- create a skipped outbox row so the debugger can show the dry-run decision.
create or replace function private.enqueue_event_postbacks()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.postback_jobs (
    organization_id, app_id, destination_id, event_id, idempotency_key,
    provider_event_id, status, payload, next_attempt_at, skip_reason, completed_at
  )
  select
    new.organization_id,
    new.app_id,
    destination.id,
    new.id,
    new.event_id::text,
    new.event_id::text,
    case when installation.environment = 'development'
      then 'skipped'::public.job_status else 'pending'::public.job_status end,
    jsonb_build_object('schemaVersion', 1, 'dryRun', installation.environment = 'development'),
    now(),
    case when installation.environment = 'development' then 'development_dry_run' end,
    case when installation.environment = 'development' then statement_timestamp() end
  from public.postback_destinations destination
  join public.installations installation
    on installation.id = new.installation_id
   and installation.organization_id = new.organization_id
   and installation.app_id = new.app_id
  where destination.organization_id = new.organization_id
    and destination.app_id = new.app_id
    and destination.event_name = new.name
    and destination.status = 'active'
  on conflict (destination_id, idempotency_key) do nothing;
  return new;
end;
$$;

create or replace function private.trace_development_postback()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_installation_id uuid;
  linked_provider text;
begin
  select event_row.installation_id, destination.provider::text
    into linked_installation_id, linked_provider
  from public.events event_row
  join public.installations installation on installation.id = event_row.installation_id
  join public.postback_destinations destination on destination.id = new.destination_id
  where event_row.id = new.event_id
    and installation.environment = 'development';
  if linked_installation_id is null then return new; end if;

  insert into public.development_debug_events (
    organization_id, app_id, stage, status, title, detail,
    installation_id, event_id, postback_job_id, metadata, occurred_at
  ) values (
    new.organization_id, new.app_id, 'postback', 'dry_run',
    'Postback simulado', 'Attruvi validó el envío a ' || replace(linked_provider, '_ads', '') || ' sin contactar a la red.',
    linked_installation_id, new.event_id, new.id,
    jsonb_build_object('provider', linked_provider, 'reason', 'development_dry_run'),
    new.created_at
  );
  return new;
end;
$$;

create trigger postback_jobs_development_debug_trace
after insert on public.postback_jobs
for each row execute function private.trace_development_postback();

create or replace function public.create_development_test_event(
  requested_app_id uuid,
  requested_event_name text default 'sign_up'
)
returns table (
  request_id uuid,
  installation_id uuid,
  event_id uuid,
  event_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_organization_id uuid;
  requested_currency text;
  requested_platform public.app_platform_kind;
  sdk_key_id uuid;
  generated_request_id uuid := gen_random_uuid();
  generated_installation_id uuid := gen_random_uuid();
  generated_anonymous_id uuid := gen_random_uuid();
  generated_session_id uuid := gen_random_uuid();
  generated_event_id uuid := gen_random_uuid();
  generated_batch_id uuid := gen_random_uuid();
  generated_transaction_id text := 'attruvi-test-' || gen_random_uuid()::text;
  occurred_at timestamptz := statement_timestamp();
  properties jsonb := '{}'::jsonb;
  ingest_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if requested_event_name not in ('sign_up', 'purchase', 'subscription_started') then
    raise exception 'unsupported_test_event' using errcode = '22023';
  end if;

  select app.organization_id, app.currency
    into requested_organization_id, requested_currency
  from public.apps app
  where app.id = requested_app_id and app.status = 'active';

  if requested_organization_id is null
    or not private.has_organization_role(
      requested_organization_id,
      array['owner', 'admin']::public.organization_role[]
    ) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  if (
    select count(*) from public.development_debug_events debug
    where debug.actor_user_id = (select auth.uid())
      and debug.occurred_at >= statement_timestamp() - interval '1 minute'
  ) >= 10 then
    raise exception 'test_rate_limit' using errcode = 'P0001';
  end if;

  select platform_row.platform into requested_platform
  from public.app_platforms platform_row
  where platform_row.app_id = requested_app_id
  order by case when platform_row.platform = 'android' then 0 else 1 end
  limit 1;
  if requested_platform is null then
    raise exception 'app_platform_required' using errcode = '22023';
  end if;

  select sdk_key.id into sdk_key_id
  from public.public_sdk_keys sdk_key
  where sdk_key.app_id = requested_app_id
    and sdk_key.environment = 'development'
    and sdk_key.status = 'active'
  order by sdk_key.created_at desc
  limit 1;
  if sdk_key_id is null then
    raise exception 'development_sdk_key_required' using errcode = '22023';
  end if;

  if requested_event_name = 'purchase' then
    properties := jsonb_build_object(
      'transactionId', generated_transaction_id,
      'orderId', generated_transaction_id,
      'valueMinor', '4990',
      'currency', requested_currency,
      'productId', 'attruvi-test-product'
    );
  elsif requested_event_name = 'subscription_started' then
    properties := jsonb_build_object(
      'transactionId', generated_transaction_id,
      'valueMinor', '999',
      'currency', requested_currency,
      'productId', 'attruvi-test-premium',
      'subscriptionId', 'attruvi-test-sub-' || generated_event_id::text
    );
  end if;

  ingest_result := public.ingest_sdk_messages_v3(jsonb_build_object(
    'messages', jsonb_build_array(
      jsonb_build_object(
        'version', 1,
        'requestId', generated_request_id,
        'receivedAt', occurred_at,
        'keyId', sdk_key_id,
        'organizationId', requested_organization_id,
        'appId', requested_app_id,
        'environment', 'development',
        'logicalOrigin', 'dashboard-test',
        'attestation', 'absent',
        'kind', 'installation',
        'accessTokenHash', pg_catalog.encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'),
        'body', jsonb_build_object(
          'installationId', generated_installation_id,
          'anonymousId', generated_anonymous_id,
          'occurredAt', occurred_at,
          'environment', 'development',
          'platform', requested_platform,
          'sdkVersion', '0.1.0-dashboard-test',
          'appVersion', 'setup-demo',
          'consent', 'granted'
        )
      ),
      jsonb_build_object(
        'version', 1,
        'requestId', gen_random_uuid(),
        'receivedAt', occurred_at,
        'keyId', sdk_key_id,
        'organizationId', requested_organization_id,
        'appId', requested_app_id,
        'environment', 'development',
        'logicalOrigin', 'dashboard-test',
        'attestation', 'absent',
        'kind', 'events',
        'body', jsonb_build_object(
          'batchId', generated_batch_id,
          'sentAt', occurred_at,
          'environment', 'development',
          'platform', requested_platform,
          'sdkVersion', '0.1.0-dashboard-test',
          'events', jsonb_build_array(jsonb_build_object(
            'eventId', generated_event_id,
            'installationId', generated_installation_id,
            'anonymousId', generated_anonymous_id,
            'sessionId', generated_session_id,
            'name', requested_event_name,
            'occurredAt', occurred_at,
            'idempotencyKey', 'dashboard-test:' || generated_event_id::text,
            'properties', properties
          ))
        )
      )
    )
  ));

  update public.development_debug_events debug
  set actor_user_id = (select auth.uid()),
      request_id = coalesce(debug.request_id, generated_request_id)
  where debug.app_id = requested_app_id
    and (debug.installation_id = generated_installation_id or debug.event_id = generated_event_id);

  if not exists (
    select 1 from public.development_debug_events debug
    where debug.event_id = generated_event_id and debug.stage = 'postback'
  ) then
    insert into public.development_debug_events (
      organization_id, app_id, actor_user_id, stage, status, title, detail,
      request_id, installation_id, event_id, metadata, occurred_at
    ) values (
      requested_organization_id, requested_app_id, (select auth.uid()),
      'postback', 'dry_run', 'Postback simulado',
      'No hay un destino activo para este evento; no se contactó a ninguna red.',
      generated_request_id, generated_installation_id, generated_event_id,
      jsonb_build_object('reason', 'no_active_destination'), occurred_at
    );
  end if;

  insert into public.audit_log (
    organization_id, app_id, actor_user_id, actor_kind, action,
    target_table, target_id, request_id, after_state
  ) values (
    requested_organization_id, requested_app_id, (select auth.uid()), 'user',
    'setup.test_event_created', 'events', generated_event_id, generated_request_id,
    jsonb_build_object('environment', 'development', 'event_name', requested_event_name)
  );

  return query select generated_request_id, generated_installation_id, generated_event_id, requested_event_name;
end;
$$;

revoke all on function public.create_development_test_event(uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_development_test_event(uuid, text)
  to authenticated;

revoke all on function private.trace_development_installation() from public, anon, authenticated;
revoke all on function private.trace_development_event() from public, anon, authenticated;
revoke all on function private.trace_development_attribution() from public, anon, authenticated;
revoke all on function private.trace_test_link_click() from public, anon, authenticated;
revoke all on function private.trace_development_postback() from public, anon, authenticated;

comment on function public.create_public_sdk_key(uuid, public.environment_kind, text, text, boolean) is
  'Creates or rotates one public SDK identifier atomically. The caller is authenticated and authorized inside the function; only the SHA-256 digest is stored.';
comment on function public.create_development_test_event(uuid, text) is
  'Creates a bounded development-only SDK journey through the production-equivalent ingest/activity pipeline. It cannot enqueue external provider calls.';
