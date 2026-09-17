begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select has_column('public', 'postback_destinations', 'connector_account_id', 'el destino referencia una cuenta cifrada');
select has_column('public', 'postback_jobs', 'provider_event_id', 'el outbox conserva un event_id estable');
select has_column('public', 'postback_jobs', 'dead_lettered_at', 'los fallos definitivos entran en dead-letter');
select has_column('public', 'postback_attempts', 'request_metadata', 'cada intento conserva metadatos seguros');
select has_function('public', 'claim_postback_jobs', array['text', 'integer'], 'el worker reclama trabajos atómicamente');
select has_function('public', 'complete_postback_job', array['uuid','text','job_status','integer','text','text','text','integer','integer','timestamp with time zone','text','jsonb'], 'el worker completa e historiza en una sola operación');
select has_function('public', 'replay_postback_job', array['uuid'], 'existe replay manual auditado');
select has_function('public', 'get_postback_dashboard_summary', array['uuid'], 'el panel usa agregados server-side');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change
) values (
  '00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000101',
  'authenticated','authenticated','postback-owner@attruvi.invalid',extensions.crypt('test-only-password', extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','',''
) on conflict (id) do nothing;

insert into public.organizations (id, name, slug, created_by)
values ('10000000-0000-4000-8000-000000000001','Postback fixture','postback-fixture','00000000-0000-4000-8000-000000000101')
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role)
values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','owner')
on conflict (organization_id, user_id) do update set role = 'owner';

insert into public.apps (id, organization_id, name, slug, timezone, currency)
values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Postback app','postback-app','Europe/Madrid','EUR')
on conflict (id) do nothing;

insert into public.installations (
  id, organization_id, app_id, installation_key_hash, platform, environment,
  first_open_at, last_seen_at, consent_state
) values (
  '90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',extensions.digest('postback-installation','sha256'),
  'android','production','2026-09-17T07:00:00Z','2026-09-17T08:00:00Z','granted'
) on conflict (id) do nothing;

insert into public.app_users (id, organization_id, app_id, first_seen_at, last_seen_at)
values (
  '94000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','2026-09-17T07:00:00Z','2026-09-17T08:00:00Z'
) on conflict (id) do nothing;

insert into public.app_user_installations (
  organization_id, app_id, app_user_id, installation_id, linked_at
) values (
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','2026-09-17T07:00:00Z'
) on conflict (app_id, installation_id) do nothing;

insert into public.connector_accounts (
  id, organization_id, app_id, provider, external_account_id, external_account_hint,
  account_name, account_currency, api_version, connection_state, status
) values (
  'd5100000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'google_ads', '1234567890', '····7890', 'Google Postback Fixture', 'EUR', 'v25', 'ready', 'active'
);

insert into public.postback_destinations (
  id, organization_id, app_id, connector_account_id, provider, provider_mode,
  name, event_name, provider_event_name, external_conversion_id, api_version,
  status, send_value, value_mode, currency_mode
) values (
  'd5200000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'd5100000-0000-4000-8000-000000000001',
  'google_ads', 'google_click_conversion', 'google_ads:fixture_purchase',
  'fixture_purchase', 'Purchase', '987654321', 'v25', 'active', true, 'event', 'event'
);

select throws_ok(
  $$insert into public.postback_destinations (
      organization_id, app_id, connector_account_id, provider, provider_mode, name,
      event_name, provider_event_name, external_conversion_id, api_version, status
    ) values (
      '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
      'd5100000-0000-4000-8000-000000000001', 'meta_ads', 'meta_conversions_api',
      'invalid-provider', 'purchase', 'Purchase', 'dataset', 'v26.0', 'active'
    )$$,
  '23514',
  'postback connector provider does not match destination',
  'una cuenta de otra red no puede alimentar el destino'
);

insert into public.events (
  id, organization_id, app_id, installation_id, app_user_id, event_id,
  idempotency_key, name, occurred_at, properties, value_minor, currency
) values (
  'd5300000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001','d5310000-0000-4000-8000-000000000001',
  'postback-fixture-1','fixture_purchase','2026-09-17T08:00:00Z','{"transaction_id":"safe-order-1"}',1234,'EUR'
);

select is(
  (select count(*) from public.postback_jobs where event_id = 'd5300000-0000-4000-8000-000000000001'),
  1::bigint,
  'insertar el evento crea exactamente un trabajo outbox'
);

select is(
  (select provider_event_id from public.postback_jobs where event_id = 'd5300000-0000-4000-8000-000000000001'),
  'd5310000-0000-4000-8000-000000000001',
  'el event_id público es estable para deduplicación del proveedor'
);

set local role service_role;

select is(
  (select count(*) from public.claim_postback_jobs('postback-worker-1', 10)),
  1::bigint,
  'un worker reclama el trabajo una sola vez'
);

select is(
  (select attempt_count from public.postback_jobs where event_id = 'd5300000-0000-4000-8000-000000000001'),
  1,
  'la reclamación incrementa el intento atómicamente'
);

select lives_ok(
  $$select public.complete_postback_job(
    requested_job_id => (select id from public.postback_jobs where event_id = 'd5300000-0000-4000-8000-000000000001'),
    requested_worker_id => 'postback-worker-1',
    requested_status => 'succeeded',
    requested_http_status => 200,
    requested_provider_request_id => 'safe-provider-reference',
    requested_response_excerpt => '{"accepted":1}',
    requested_duration_ms => 41,
    requested_request_metadata => '{"provider":"google_ads","apiVersion":"v25"}'::jsonb
  )$$,
  'el worker finaliza sin mantener una transacción durante la llamada externa'
);

select ok(
  (select status = 'succeeded' and completed_at is not null and latency_ms = 41
   from public.postback_jobs where event_id = 'd5300000-0000-4000-8000-000000000001'),
  'el resultado final y la latencia se guardan'
);

select is(
  (select count(*) from public.postback_attempts where postback_job_id = (
    select id from public.postback_jobs where event_id = 'd5300000-0000-4000-8000-000000000001'
  )),
  1::bigint,
  'cada entrega genera un intento único'
);

reset role;

insert into public.events (
  id, organization_id, app_id, installation_id, app_user_id, event_id,
  idempotency_key, name, occurred_at, properties, value_minor, currency
) values (
  'd5300000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001','d5310000-0000-4000-8000-000000000002',
  'postback-fixture-2','fixture_purchase','2026-09-17T08:05:00Z','{}',500,'EUR'
);

set local role service_role;
select is((select count(*) from public.claim_postback_jobs('postback-worker-2', 10)), 1::bigint, 'el segundo trabajo queda disponible');

select lives_ok(
  $$select public.complete_postback_job(
    requested_job_id => (select id from public.postback_jobs where event_id = 'd5300000-0000-4000-8000-000000000002'),
    requested_worker_id => 'postback-worker-2',
    requested_status => 'skipped',
    requested_provider_error_code => 'consent_not_granted',
    requested_skip_reason => 'consent_not_granted',
    requested_duration_ms => 2
  )$$,
  'un evento no elegible queda omitido, no marcado como éxito'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);

select lives_ok(
  $$select public.replay_postback_job((select id from public.postback_jobs where event_id = 'd5300000-0000-4000-8000-000000000002' and replayed_from_job_id is null))$$,
  'un owner puede reencolar un omitido de forma auditada'
);

select ok(
  (select count(*) = 2 and count(distinct provider_event_id) = 1
   from public.postback_jobs where event_id = 'd5300000-0000-4000-8000-000000000002'),
  'el replay crea un trabajo nuevo pero conserva el event_id del proveedor'
);

select is(
  (select count(*) from public.audit_log where action = 'postback.replayed' and target_table = 'postback_jobs'),
  1::bigint,
  'el replay deja auditoría sin secretos'
);

select ok(
  (select total = 3 and succeeded = 1 and skipped = 1 and pending = 1
   from public.get_postback_dashboard_summary('20000000-0000-4000-8000-000000000001')),
  'el resumen server-side refleja la cola completa'
);

reset role;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change
) values (
  '00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000399',
  'authenticated','authenticated','postback-viewer@attruvi.invalid',extensions.crypt('test-only-password', extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','',''
) on conflict (id) do nothing;
reset role;
insert into public.organization_members (organization_id, user_id, role)
values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000399','viewer')
on conflict (organization_id, user_id) do update set role = 'viewer';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000399', true);

select throws_ok(
  $$select public.replay_postback_job((select id from public.postback_jobs where event_id = 'd5300000-0000-4000-8000-000000000002' and replayed_from_job_id is null))$$,
  '42501',
  'postback job is unavailable',
  'un viewer no puede ejecutar replay'
);

select throws_ok(
  $$insert into public.postback_destinations (
      organization_id, app_id, provider, provider_mode, name, event_name,
      provider_event_name, external_conversion_id, api_version, status
    ) values (
      '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
      'google_ads','google_click_conversion','viewer-write','purchase','Purchase','1','v25','paused'
    )$$,
  '42501',
  null,
  'un viewer no puede modificar destinos'
);

select * from finish();
rollback;
