-- Keep public tables deny-by-default even when a future migration forgets to
-- enable RLS explicitly. This function and trigger existed in production but
-- were missing from the versioned migration chain, which made clean branches
-- fail when the hardening migration attempted to revoke access to the function.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name = 'public' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    end if;
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_event_trigger
    where evtname = 'ensure_rls'
  ) then
    create event trigger ensure_rls
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  end if;
end;
$$;

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
