create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.organization_role not null,
  token_hash bytea not null unique,
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references auth.users (id) on delete restrict,
  accepted_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_invitations_email check (
    email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and char_length(email) between 3 and 254
  ),
  constraint organization_invitations_expiry check (expires_at > created_at),
  constraint organization_invitations_acceptance check (
    (status = 'accepted' and accepted_at is not null and accepted_by is not null)
    or (status <> 'accepted' and accepted_at is null and accepted_by is null)
  )
);

create unique index organization_invitations_pending_email_idx
  on public.organization_invitations (organization_id, email)
  where status = 'pending';
create index organization_invitations_org_created_idx
  on public.organization_invitations (organization_id, created_at desc);
create index organization_invitations_invited_by_fk_idx
  on public.organization_invitations (invited_by);
create index organization_invitations_accepted_by_fk_idx
  on public.organization_invitations (accepted_by)
  where accepted_by is not null;

create trigger organization_invitations_set_updated_at
before update on public.organization_invitations
for each row execute function private.set_updated_at();

alter table public.organization_invitations enable row level security;
revoke all on table public.organization_invitations from anon, authenticated;
grant select on table public.organization_invitations to authenticated;
grant all on table public.organization_invitations to service_role;

create policy organization_invitations_owner_read
on public.organization_invitations for select to authenticated
using ((select private.has_organization_role(
  organization_id,
  array['owner']::public.organization_role[]
)));

drop policy if exists organization_members_admin_insert on public.organization_members;
drop policy if exists organization_members_admin_update on public.organization_members;
drop policy if exists organization_members_admin_delete on public.organization_members;

create policy organization_members_owner_insert on public.organization_members
for insert to authenticated
with check (
  (select private.has_organization_role(
    organization_id,
    array['owner']::public.organization_role[]
  ))
  or (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1 from public.organizations organization
      where organization.id = organization_id
        and organization.created_by = (select auth.uid())
    )
  )
);

create policy organization_members_owner_update on public.organization_members
for update to authenticated
using ((select private.has_organization_role(
  organization_id,
  array['owner']::public.organization_role[]
)))
with check ((select private.has_organization_role(
  organization_id,
  array['owner']::public.organization_role[]
)));

create policy organization_members_owner_delete on public.organization_members
for delete to authenticated
using ((select private.has_organization_role(
  organization_id,
  array['owner']::public.organization_role[]
)));

create or replace function public.create_organization_invitation(
  requested_organization_id uuid,
  requested_email text,
  requested_role public.organization_role,
  requested_token_hash text,
  requested_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_email text := lower(btrim(requested_email));
  invitation_id uuid;
begin
  if caller_id is null
    or not (select private.has_organization_role(
      requested_organization_id,
      array['owner']::public.organization_role[]
    )) then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if requested_role is null
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(normalized_email) not between 3 and 254
    or requested_token_hash !~ '^[0-9a-f]{64}$'
    or requested_expires_at not between statement_timestamp() + interval '1 hour'
      and statement_timestamp() + interval '30 days' then
    raise exception 'invalid_invitation' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.organization_members member
    join auth.users invited_user on invited_user.id = member.user_id
    where member.organization_id = requested_organization_id
      and lower(invited_user.email) = normalized_email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  update public.organization_invitations
  set status = 'revoked'
  where organization_id = requested_organization_id
    and email = normalized_email
    and status = 'pending';

  insert into public.organization_invitations (
    organization_id, email, role, token_hash, invited_by, expires_at
  ) values (
    requested_organization_id,
    normalized_email,
    requested_role,
    decode(requested_token_hash, 'hex'),
    caller_id,
    requested_expires_at
  ) returning id into invitation_id;

  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, target_table, target_id,
    after_state
  ) values (
    requested_organization_id, caller_id, 'user',
    'organization_invitation.created', 'organization_invitations', invitation_id,
    jsonb_build_object('email', normalized_email, 'role', requested_role)
  );

  return invitation_id;
end;
$$;

create or replace function public.accept_organization_invitation(requested_token text)
returns table (organization_slug text, first_app_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_email text;
  invitation public.organization_invitations%rowtype;
begin
  if caller_id is null or requested_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'invalid_invitation' using errcode = '22023';
  end if;

  select lower(email) into caller_email from auth.users where id = caller_id;
  select * into invitation
  from public.organization_invitations candidate
  where candidate.token_hash = extensions.digest(requested_token, 'sha256')
  for update;

  if invitation.id is null
    or invitation.status <> 'pending'
    or invitation.expires_at <= statement_timestamp()
    or invitation.email <> caller_email then
    raise exception 'invalid_invitation' using errcode = '42501';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (invitation.organization_id, caller_id, invitation.role)
  on conflict (organization_id, user_id) do update
  set role = excluded.role, updated_at = statement_timestamp();

  update public.organization_invitations
  set status = 'accepted', accepted_by = caller_id,
      accepted_at = statement_timestamp()
  where id = invitation.id;

  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, target_table, target_id,
    after_state
  ) values (
    invitation.organization_id, caller_id, 'user',
    'organization_invitation.accepted', 'organization_members', caller_id,
    jsonb_build_object('role', invitation.role)
  );

  return query
  select organization.slug,
    (select app.slug from public.apps app
      where app.organization_id = invitation.organization_id
      order by app.created_at limit 1)
  from public.organizations organization
  where organization.id = invitation.organization_id;
end;
$$;

create or replace function public.change_organization_member_role(
  requested_organization_id uuid,
  requested_user_id uuid,
  requested_role public.organization_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  previous_role public.organization_role;
begin
  if caller_id is null
    or not (select private.has_organization_role(
      requested_organization_id,
      array['owner']::public.organization_role[]
    )) then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  select role into previous_role
  from public.organization_members
  where organization_id = requested_organization_id
    and user_id = requested_user_id
  for update;
  if previous_role is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  if previous_role = 'owner' and requested_role <> 'owner'
    and (select count(*) from public.organization_members
      where organization_id = requested_organization_id and role = 'owner') <= 1 then
    raise exception 'last_owner' using errcode = '23514';
  end if;

  update public.organization_members
  set role = requested_role
  where organization_id = requested_organization_id
    and user_id = requested_user_id;

  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, target_table, target_id,
    before_state, after_state
  ) values (
    requested_organization_id, caller_id, 'user',
    'organization_member.role_changed', 'organization_members', requested_user_id,
    jsonb_build_object('role', previous_role),
    jsonb_build_object('role', requested_role)
  );
end;
$$;

create or replace function public.read_organization_team(requested_organization_id uuid)
returns table (
  member_id uuid,
  user_id uuid,
  email text,
  display_name text,
  role public.organization_role,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_organization_member(requested_organization_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select member.id, member.user_id, invited_user.email,
    coalesce(profile.display_name, split_part(invited_user.email, '@', 1)),
    member.role, member.created_at
  from public.organization_members member
  join auth.users invited_user on invited_user.id = member.user_id
  left join public.profiles profile on profile.id = member.user_id
  where member.organization_id = requested_organization_id
  order by case member.role when 'owner' then 1 when 'admin' then 2 else 3 end,
    lower(invited_user.email);
end;
$$;

revoke execute on function public.create_organization_invitation(uuid, text, public.organization_role, text, timestamptz) from public, anon;
revoke execute on function public.accept_organization_invitation(text) from public, anon;
revoke execute on function public.change_organization_member_role(uuid, uuid, public.organization_role) from public, anon;
revoke execute on function public.read_organization_team(uuid) from public, anon;
grant execute on function public.create_organization_invitation(uuid, text, public.organization_role, text, timestamptz) to authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;
grant execute on function public.change_organization_member_role(uuid, uuid, public.organization_role) to authenticated;
grant execute on function public.read_organization_team(uuid) to authenticated;

comment on table public.organization_invitations is
  'Single-use team invitations. Only token hashes are stored; owners can inspect pending invitation metadata under RLS.';
comment on function public.create_organization_invitation(uuid, text, public.organization_role, text, timestamptz) is
  'Owner-only invitation creation. SECURITY DEFINER validates auth.uid(), membership, role, token hash and expiry before writing.';
comment on function public.accept_organization_invitation(text) is
  'Accepts a single-use invitation only when the authenticated email matches. SECURITY DEFINER is required to read auth.users and the token hash.';
comment on function public.change_organization_member_role(uuid, uuid, public.organization_role) is
  'Owner-only role change that prevents demoting the final owner and writes an audit event.';
comment on function public.read_organization_team(uuid) is
  'Returns organization member identity only after membership validation; required because profiles are otherwise self-only.';
