do $$
declare
  previous_definition text;
  corrected_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.ensure_personal_workspace(text)'::regprocedure
  ) into previous_definition;

  corrected_definition := pg_catalog.replace(
    previous_definition,
    'on conflict (organization_id, user_id) do update',
    'on conflict on constraint organization_members_unique_user do update'
  );

  if corrected_definition = previous_definition then
    raise exception 'personal workspace conflict target not found';
  end if;

  execute corrected_definition;
end;
$$;
