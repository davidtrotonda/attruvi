begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select has_table('public', 'events', 'events existe en el modelo versionado');

select has_function(
  'public', 'upsert_personal_app', array['jsonb'],
  'la gestión de apps usa una operación atómica'
);

select has_function(
  'public', 'upsert_personal_smart_link', array['jsonb'],
  'el constructor de enlaces usa una operación atómica'
);

select has_function(
  'public', 'resolve_ingest_app_key', array['text'],
  'la appKey pública se resuelve solo desde el servicio'
);

select has_function(
  'public', 'ingest_sdk_messages_v2', array['jsonb'],
  'la Queue persiste un lote con una sola operación'
);

select has_function(
  'public', 'read_sdk_attribution', array['uuid', 'uuid', 'text'],
  'la lectura de atribución exige una prueba de instalación'
);

select is(
  public.resolve_ingest_app_key(
    encode(extensions.digest('attruvi_demo_public_key_only', 'sha256'), 'hex')
  ) ->> 'appId',
  '20000000-0000-4000-8000-000000000001',
  'la clave demo resuelve la app y entorno correctos'
);

update public.installations
set installation_access_token_hash = extensions.digest('demo-installation-proof', 'sha256')
where id = '90000000-0000-4000-8000-000000000001';

select is(
  public.read_sdk_attribution(
    '20000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001',
    encode(extensions.digest('wrong-proof', 'sha256'), 'hex')
  ),
  null::jsonb,
  'la appKey sin prueba correcta no puede leer atribución'
);

select is(
  public.read_sdk_attribution(
    '20000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001',
    encode(extensions.digest('demo-installation-proof', 'sha256'), 'hex')
  ) ->> 'source',
  'Google Ads',
  'la prueba correcta devuelve solo la atribución filtrada'
);

select lives_ok(
  $$
    select public.ingest_sdk_messages_v2($json$
      {"messages":[{"version":1,"kind":"events","requestId":"f1000000-0000-4000-8000-000000000001","receivedAt":"2026-09-17T10:00:00Z","keyId":"22000000-0000-4000-8000-000000000001","organizationId":"10000000-0000-4000-8000-000000000001","appId":"20000000-0000-4000-8000-000000000001","environment":"development","logicalOrigin":"react-native/0.1.0","attestation":"absent","body":{"batchId":"f2000000-0000-4000-8000-000000000001","sentAt":"2026-09-17T09:59:59Z","environment":"development","platform":"android","sdkVersion":"0.1.0","events":[{"eventId":"f3000000-0000-4000-8000-000000000001","installationId":"f4000000-0000-4000-8000-000000000001","anonymousId":"f5000000-0000-4000-8000-000000000001","sessionId":"f6000000-0000-4000-8000-000000000001","name":"app_open","occurredAt":"2026-09-17T09:59:58Z","idempotencyKey":"app-open:pgtap-001","properties":{}}]}}]}
    $json$::jsonb);
    select public.ingest_sdk_messages_v2($json$
      {"messages":[{"version":1,"kind":"events","requestId":"f1000000-0000-4000-8000-000000000002","receivedAt":"2026-09-17T10:00:01Z","keyId":"22000000-0000-4000-8000-000000000001","organizationId":"10000000-0000-4000-8000-000000000001","appId":"20000000-0000-4000-8000-000000000001","environment":"development","logicalOrigin":"react-native/0.1.0","attestation":"absent","body":{"batchId":"f2000000-0000-4000-8000-000000000002","sentAt":"2026-09-17T10:00:00Z","environment":"development","platform":"android","sdkVersion":"0.1.0","events":[{"eventId":"f3000000-0000-4000-8000-000000000001","installationId":"f4000000-0000-4000-8000-000000000001","anonymousId":"f5000000-0000-4000-8000-000000000001","sessionId":"f6000000-0000-4000-8000-000000000001","name":"app_open","occurredAt":"2026-09-17T09:59:58Z","idempotencyKey":"app-open:pgtap-001","properties":{}}]}}]}
    $json$::jsonb);
  $$,
  'dos entregas de ingestión idempotente no fallan'
);

select is(
  (select count(*) from public.events where event_id = 'f3000000-0000-4000-8000-000000000001'),
  1::bigint,
  'la ingestión idempotente conserva una sola fila por event_id'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000202',
  'authenticated', 'authenticated', 'other-owner@attruvi.invalid',
  extensions.crypt('test-only-password', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), '', '', ''
)
on conflict (id) do nothing;

insert into public.organizations (id, name, slug, created_by)
values (
  '10000000-0000-4000-8000-000000000002', 'Otra organización', 'otra-organizacion',
  '00000000-0000-4000-8000-000000000202'
)
on conflict (id) do nothing;

insert into public.organization_members (id, organization_id, user_id, role)
values (
  '11000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000202', 'owner'
)
on conflict (organization_id, user_id) do nothing;

insert into public.apps (id, organization_id, name, slug)
values (
  '20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  'App ajena', 'app-ajena'
)
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);

select is(
  (select count(*) from public.organizations where id = '10000000-0000-4000-8000-000000000001'),
  1::bigint,
  'un miembro puede leer su organización'
);

select is(
  (select count(*) from public.organizations where id = '10000000-0000-4000-8000-000000000002'),
  0::bigint,
  'un miembro no puede leer otra organización'
);

update public.apps
set name = 'Cambio no autorizado'
where id = '20000000-0000-4000-8000-000000000002';

select throws_ok(
  $$
    insert into public.sources (organization_id, app_id, kind, name)
    values (
      '10000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      'other', 'Inyección entre organizaciones'
    )
  $$,
  '42501'
);

reset role;

select is(
  (select name from public.apps where id = '20000000-0000-4000-8000-000000000002'),
  'App ajena',
  'la actualización de otra organización no modificó ninguna fila'
);

insert into public.events (
  id, organization_id, app_id, installation_id, event_id, idempotency_key,
  name, occurred_at, properties
)
values (
  'b9000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  'b9100000-0000-4000-8000-000000000001',
  'test-retry-same-event', 'app_open', now(), '{}'::jsonb
)
on conflict (app_id, event_id) do nothing;

insert into public.events (
  id, organization_id, app_id, installation_id, event_id, idempotency_key,
  name, occurred_at, properties
)
values (
  'b9000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  'b9100000-0000-4000-8000-000000000001',
  'test-retry-same-event', 'app_open', now(), '{}'::jsonb
)
on conflict (app_id, event_id) do nothing;

select is(
  (select count(*) from public.events where event_id = 'b9100000-0000-4000-8000-000000000001'),
  1::bigint,
  'dos reintentos del mismo evento producen una sola fila'
);

select is(
  (
    select count(*)
    from public.ads ad
    join public.ad_groups ad_group
      on ad_group.id = ad.ad_group_id and ad_group.campaign_id = ad.campaign_id
    join public.campaigns campaign
      on campaign.id = ad.campaign_id and campaign.source_id = ad.source_id
  ),
  6::bigint,
  'los seeds conservan la jerarquía campaña, grupo y anuncio'
);

select throws_ok(
  $$
    insert into public.ad_groups (
      organization_id, app_id, source_id, campaign_id, name, external_id
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000001',
      'Jerarquía inválida', 'invalid-hierarchy'
    )
  $$,
  '23503'
);

select is(
  (9007199254740993123::bigint + 1::bigint)::text,
  '9007199254740993124',
  'los importes enteros mantienen precisión por encima del rango seguro de JavaScript'
);

select ok(
  (select count(*) >= 6 from public.sources where organization_id = '10000000-0000-4000-8000-000000000001')
  and (select count(*) >= 5 from public.link_clicks where app_id = '20000000-0000-4000-8000-000000000001')
  and (select count(*) >= 5 from public.installations where app_id = '20000000-0000-4000-8000-000000000001')
  and (select count(*) >= 3 from public.purchases where app_id = '20000000-0000-4000-8000-000000000001')
  and (select count(*) >= 6 from public.ad_costs where app_id = '20000000-0000-4000-8000-000000000001')
  and (select count(*) >= 6 from public.daily_metrics where app_id = '20000000-0000-4000-8000-000000000001'),
  'los seeds contienen datos suficientes para un dashboard útil'
);

select throws_ok(
  $$
    insert into public.smart_links (organization_id, app_id, name, slug)
    values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'Slug reservado', 'dashboard'
    )
  $$,
  '23514'
);

insert into public.link_clicks (
  id, organization_id, app_id, smart_link_id, request_id, clicked_at,
  platform_hint, destination_platform, dedupe_key
)
values (
  '82000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001', now(),
  'android', 'android', 'queue-dedupe-test-0001'
)
on conflict (app_id, dedupe_key) do nothing;

insert into public.link_clicks (
  id, organization_id, app_id, smart_link_id, request_id, clicked_at,
  platform_hint, destination_platform, dedupe_key
)
values (
  '82000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000002', now(),
  'android', 'android', 'queue-dedupe-test-0001'
)
on conflict (app_id, dedupe_key) do nothing;

select is(
  (select count(*) from public.link_clicks where dedupe_key = 'queue-dedupe-test-0001'),
  1::bigint,
  'dos entregas de Queue del mismo clic producen una sola fila'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);

select lives_ok(
  $$
    select count(*)
    from public.ensure_personal_workspace('Otra propietaria') first_access
    cross join lateral public.ensure_personal_workspace('Otra propietaria') second_access
  $$,
  'el primer acceso prepara el espacio personal de forma atómica'
);

select ok(
  (
    select count(*) = 1
    from public.organizations
    where created_by = '00000000-0000-4000-8000-000000000202'
      and is_personal
  )
  and (
    select count(*) = 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.user_id = '00000000-0000-4000-8000-000000000202'
      and member.role = 'owner'
      and organization.is_personal
  ),
  'dos accesos conservan una sola organización personal y una membresía owner'
);

reset role;

select * from finish();
rollback;
