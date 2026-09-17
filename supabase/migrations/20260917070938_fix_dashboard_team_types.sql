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
  select member.id, member.user_id, invited_user.email::text,
    coalesce(profile.display_name, split_part(invited_user.email, '@', 1))::text,
    member.role, member.created_at
  from public.organization_members member
  join auth.users invited_user on invited_user.id = member.user_id
  left join public.profiles profile on profile.id = member.user_id
  where member.organization_id = requested_organization_id
  order by case member.role when 'owner' then 1 when 'admin' then 2 else 3 end,
    lower(invited_user.email);
end;
$$;

comment on function public.read_organization_team(uuid) is
  'Returns organization member identity only after membership validation; required because profiles are otherwise self-only.';
