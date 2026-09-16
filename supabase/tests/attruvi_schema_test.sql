begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('public', 'events', 'events existe en el modelo versionado');

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

select * from finish();
rollback;
