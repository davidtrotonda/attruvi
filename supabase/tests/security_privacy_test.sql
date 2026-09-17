begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select has_table('public', 'app_privacy_settings', 'privacidad por app está versionada');
select has_function('public', 'issue_connector_oauth_state', array['uuid','text','text'], 'OAuth registra estado de un solo uso');
select has_function('public', 'consume_connector_oauth_state', array['uuid','text','text'], 'OAuth consume estado atómicamente');
select has_function('public', 'export_app_user_data', array['uuid','uuid'], 'existe exportación por perfil');
select has_function('public', 'run_app_privacy_retention', array['uuid','boolean'], 'existe retención reproducible');

select is(
  (select count(*) from pg_catalog.pg_class class
   join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
   where namespace.nspname = 'public' and class.relkind in ('r','p') and not class.relrowsecurity),
  0::bigint,
  'todas las tablas públicas tienen RLS activado'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change
) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000901','authenticated','authenticated','security-owner@attruvi.invalid',extensions.crypt('test-only-password', extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000902','authenticated','authenticated','security-viewer@attruvi.invalid',extensions.crypt('test-only-password', extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000903','authenticated','authenticated','security-outsider@attruvi.invalid',extensions.crypt('test-only-password', extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','','')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug, created_by) values
  ('10000000-0000-4000-8000-000000000901','Security org A','security-org-a','00000000-0000-4000-8000-000000000901'),
  ('10000000-0000-4000-8000-000000000902','Security org B','security-org-b','00000000-0000-4000-8000-000000000903');
insert into public.organization_members (organization_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000901','owner'),
  ('10000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','viewer'),
  ('10000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000903','owner');
insert into public.apps (id, organization_id, name, slug, timezone, currency) values
  ('20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901','Security app A','security-app-a','UTC','EUR'),
  ('20000000-0000-4000-8000-000000000902','10000000-0000-4000-8000-000000000902','Security app B','security-app-b','UTC','EUR');
insert into public.app_users (id, organization_id, app_id, first_seen_at, last_seen_at)
values ('30000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000901','20000000-0000-4000-8000-000000000901',now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000901', true);

select is((select count(*) from public.app_privacy_settings), 1::bigint, 'owner solo lee privacidad de su organización');
select is((select count(*) from public.apps where id = '20000000-0000-4000-8000-000000000902'), 0::bigint, 'owner A no lee app de B');
select lives_ok(
  $$select public.update_app_privacy_settings('20000000-0000-4000-8000-000000000901',60::smallint,365::smallint,5::smallint,60::smallint,730::smallint,false,'test-only')$$,
  'owner cambia retención de su app'
);
select lives_ok(
  $$select public.issue_connector_oauth_state('20000000-0000-4000-8000-000000000901','google_ads',repeat('a',64))$$,
  'owner emite estado OAuth'
);
select ok(public.consume_connector_oauth_state('20000000-0000-4000-8000-000000000901','google_ads',repeat('a',64)), 'primer callback consume el estado');
select isnt(public.consume_connector_oauth_state('20000000-0000-4000-8000-000000000901','google_ads',repeat('a',64)), true, 'replay OAuth se rechaza');
select lives_ok(
  $$select public.export_app_user_data('20000000-0000-4000-8000-000000000901','30000000-0000-4000-8000-000000000901')$$,
  'owner exporta un perfil de su app'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000902', true);
select throws_ok(
  $$select public.update_app_privacy_settings('20000000-0000-4000-8000-000000000901',60::smallint,365::smallint,5::smallint,60::smallint,730::smallint,false,null)$$,
  '42501', 'forbidden', 'viewer no cambia retención'
);
select throws_ok(
  $$select public.erase_app_user('20000000-0000-4000-8000-000000000901','30000000-0000-4000-8000-000000000901')$$,
  '42501', 'forbidden', 'viewer no borra perfiles'
);
select throws_ok(
  $$select public.delete_app_data('20000000-0000-4000-8000-000000000901','security-app-a')$$,
  '42501', 'forbidden', 'viewer no borra una app'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000903', true);
select is((select count(*) from public.app_privacy_settings where app_id = '20000000-0000-4000-8000-000000000901'), 0::bigint, 'outsider no lee privacidad de A');
select throws_ok(
  $$select public.export_app_user_data('20000000-0000-4000-8000-000000000901','30000000-0000-4000-8000-000000000901')$$,
  '42501', 'forbidden', 'outsider no exporta datos de A'
);

reset role;
select isnt(has_function_privilege('authenticated', 'public.run_app_privacy_retention(uuid,boolean)', 'EXECUTE'), true, 'authenticated no ejecuta retención de servicio');
select isnt(has_function_privilege('anon', 'public.revoke_connector_secret(uuid)', 'EXECUTE'), true, 'anon no revoca secretos');
select isnt(has_table_privilege('authenticated', 'private.connector_oauth_states', 'SELECT'), true, 'clientes no leen estados OAuth');
select ok(has_schema_privilege('service_role', 'private', 'USAGE'), 'service_role puede ejecutar la allowlist privada de ingestión');
select isnt(has_schema_privilege('anon', 'private', 'USAGE'), true, 'anon no puede cruzar el límite del esquema privado');

select * from finish();
rollback;
