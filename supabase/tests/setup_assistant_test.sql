begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public', 'development_debug_events', 'el Debugger usa una tabla versionada y con RLS');
select has_function('public', 'create_public_sdk_key', array['uuid','environment_kind','text','text','boolean'], 'la clave pública se crea de forma atómica');
select has_function('public', 'create_development_test_event', array['uuid','text'], 'el dashboard puede recorrer el pipeline de development');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change
) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000601','authenticated','authenticated','setup-owner@attruvi.invalid',extensions.crypt('test-only-password', extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000602','authenticated','authenticated','setup-viewer@attruvi.invalid',extensions.crypt('test-only-password', extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000603','authenticated','authenticated','setup-outsider@attruvi.invalid',extensions.crypt('test-only-password', extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','','')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug, created_by)
values ('10000000-0000-4000-8000-000000000601','Setup fixture','setup-fixture','00000000-0000-4000-8000-000000000601');
insert into public.organization_members (organization_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000601','00000000-0000-4000-8000-000000000601','owner'),
  ('10000000-0000-4000-8000-000000000601','00000000-0000-4000-8000-000000000602','viewer');
insert into public.apps (id, organization_id, name, slug, timezone, currency)
values ('20000000-0000-4000-8000-000000000601','10000000-0000-4000-8000-000000000601','Setup app','setup-app','Europe/Madrid','EUR');
insert into public.app_platforms (organization_id, app_id, platform, android_package_name)
values ('10000000-0000-4000-8000-000000000601','20000000-0000-4000-8000-000000000601','android','com.example.setup');
insert into public.sources (organization_id, app_id, kind, name, status)
values ('10000000-0000-4000-8000-000000000601','20000000-0000-4000-8000-000000000601','organic','Orgánico','active');
insert into public.postback_destinations (
  organization_id, app_id, provider, provider_mode, name, event_name,
  provider_event_name, external_conversion_id, api_version, status,
  send_value, value_mode, currency_mode
) values (
  '10000000-0000-4000-8000-000000000601','20000000-0000-4000-8000-000000000601',
  'meta_ads','meta_conversions_api','setup-sign-up','sign_up','CompleteRegistration',
  'test-dataset','v26.0','active',false,'none','app'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000601', true);

select lives_ok(
  $$select * from public.create_public_sdk_key(
    '20000000-0000-4000-8000-000000000601','development',
    encode(extensions.digest('attruvi_dev_setup_public_value','sha256'),'hex'),
    'attruvi_dev_setupfixture',false
  )$$,
  'un owner crea la appKey sin guardar el valor legible'
);

select ok(
  (select key_hash = extensions.digest('attruvi_dev_setup_public_value','sha256')
   from public.public_sdk_keys where app_id = '20000000-0000-4000-8000-000000000601'),
  'la base conserva únicamente SHA-256 de la appKey'
);

select lives_ok(
  $$select * from public.create_development_test_event('20000000-0000-4000-8000-000000000601','sign_up')$$,
  'una persona completa el recorrido demo desde cero sin editar la base'
);

select ok(
  (select count(*) = 1 from public.installations
   where app_id = '20000000-0000-4000-8000-000000000601' and environment = 'development'),
  'la prueba queda aislada en development'
);

select ok(
  (select count(distinct stage) >= 4 from public.development_debug_events
   where app_id = '20000000-0000-4000-8000-000000000601'
     and stage in ('validation','queue','first_open','event','attribution')),
  'el Debugger muestra validación, cola, primera apertura, evento y atribución disponibles'
);

select ok(
  (select status = 'skipped' and skip_reason = 'development_dry_run'
   from public.postback_jobs where app_id = '20000000-0000-4000-8000-000000000601'),
  'un evento de development solo genera postback dry-run'
);

reset role;
set local role service_role;
select is(
  (select count(*) from public.claim_postback_jobs('must-not-send-development', 50)
   where app_id = '20000000-0000-4000-8000-000000000601'),
  0::bigint,
  'el worker nunca puede reclamar la conversión de prueba'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000602', true);
select throws_ok(
  $$select * from public.create_public_sdk_key(
    '20000000-0000-4000-8000-000000000601','development',
    encode(extensions.digest('viewer-must-not-create','sha256'),'hex'),
    'attruvi_dev_blocked',true
  )$$,
  '42501', 'insufficient_role',
  'un viewer no puede rotar la clave'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000603', true);
select is(
  (select count(*) from public.development_debug_events
   where app_id = '20000000-0000-4000-8000-000000000601'),
  0::bigint,
  'otra organización o usuario sin acceso no obtiene trazas fuera de RLS'
);

select * from finish();
rollback;
