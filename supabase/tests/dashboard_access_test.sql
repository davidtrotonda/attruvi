begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public', 'organization_invitations', 'existe la tabla versionada de invitaciones');
select has_function('public', 'create_organization_invitation', array['uuid','text','organization_role','text','timestamp with time zone'], 'existe la operación de invitación');
select has_function('public', 'change_organization_member_role', array['uuid','uuid','organization_role'], 'existe la operación owner-only de roles');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change
) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000101','authenticated','authenticated','dashboard-owner@attruvi.invalid',extensions.crypt('test-only-password', extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000301','authenticated','authenticated','viewer@attruvi.invalid',extensions.crypt('test-only-password', extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000302','authenticated','authenticated','invitee@attruvi.invalid',extensions.crypt('test-only-password', extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','','')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug, created_by)
values ('10000000-0000-4000-8000-000000000001','Dashboard access test','dashboard-access-test','00000000-0000-4000-8000-000000000101')
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role)
values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','owner')
on conflict (organization_id, user_id) do update set role = 'owner';

insert into public.organization_members (organization_id, user_id, role)
values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000301','viewer')
on conflict (organization_id, user_id) do update set role = 'viewer';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);

select lives_ok(
  $$ select public.create_organization_invitation(
    '10000000-0000-4000-8000-000000000001', 'invitee@attruvi.invalid', 'admin',
    encode(extensions.digest('dashboard-invitation-token-000000000001', 'sha256'), 'hex'),
    statement_timestamp() + interval '7 days'
  ) $$,
  'un owner puede crear una invitación'
);

select is(
  (select count(*) from public.organization_invitations where email = 'invitee@attruvi.invalid' and status = 'pending'),
  1::bigint,
  'la invitación pendiente se guarda una sola vez'
);

select throws_ok(
  $$ select public.change_organization_member_role(
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101', 'viewer'
  ) $$,
  '23514',
  'last_owner',
  'no se puede degradar al último owner'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000301', true);

select throws_ok(
  $$ select public.create_organization_invitation(
    '10000000-0000-4000-8000-000000000001', 'blocked@attruvi.invalid', 'viewer',
    encode(extensions.digest('blocked-dashboard-invitation-token-00001', 'sha256'), 'hex'),
    statement_timestamp() + interval '7 days'
  ) $$,
  '42501',
  'owner_required',
  'un viewer no puede invitar miembros'
);

select throws_ok(
  $$ select public.change_organization_member_role(
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000301', 'admin'
  ) $$,
  '42501',
  'owner_required',
  'un viewer no puede cambiar roles'
);

select throws_ok(
  $$ update public.organization_members
     set role = 'admin'
     where organization_id = '10000000-0000-4000-8000-000000000001'
       and user_id = '00000000-0000-4000-8000-000000000301' $$,
  '42501',
  'permission denied for table organization_members',
  'ningún cliente puede saltarse la RPC auditada con una escritura directa'
);

select ok(
  (select count(*) from public.read_organization_team('10000000-0000-4000-8000-000000000001')) >= 2,
  'un miembro puede leer el equipo de su organización'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000302', true);
select lives_ok(
  $$ select * from public.accept_organization_invitation('dashboard-invitation-token-000000000001') $$,
  'el correo invitado puede aceptar el token una sola vez'
);

reset role;
select is(
  (select role::text from public.organization_members where organization_id = '10000000-0000-4000-8000-000000000001' and user_id = '00000000-0000-4000-8000-000000000302'),
  'admin',
  'la aceptación asigna exactamente el rol invitado'
);

select * from finish();
rollback;
