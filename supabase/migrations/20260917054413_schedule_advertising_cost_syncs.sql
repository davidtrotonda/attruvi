-- Create at most one incremental daily job per connected account.  A completed
-- job is not recreated until the next UTC day; the account overlap controls how
-- many late-changing days are fetched again.
create or replace function public.schedule_due_connector_syncs(
  requested_today date default current_date,
  requested_limit integer default 100
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  scheduled integer;
begin
  with due_accounts as (
    select account.*
    from public.connector_accounts account
    where account.provider <> 'manual'
      and account.status = 'active'
      and account.connection_state in ('ready', 'error')
      and (account.last_synced_at is null or account.last_synced_at::date < requested_today)
      and not exists (
        select 1
        from public.connector_sync_runs open_run
        where open_run.connector_account_id = account.id
          and open_run.status in ('pending', 'running', 'retryable_failed')
      )
    order by account.last_synced_at nulls first, account.created_at
    limit greatest(1, least(requested_limit, 500))
  ), inserted as (
    insert into public.connector_sync_runs (
      organization_id,
      app_id,
      connector_account_id,
      status,
      sync_from,
      sync_to,
      overlap_days,
      api_version,
      next_attempt_at
    )
    select
      account.organization_id,
      account.app_id,
      account.id,
      'pending',
      greatest(
        coalesce(account.last_synced_at::date - account.sync_overlap_days, requested_today - 90),
        requested_today - 90
      ),
      requested_today,
      account.sync_overlap_days,
      account.api_version,
      now()
    from due_accounts account
    on conflict (connector_account_id, sync_from, sync_to)
      where status in ('pending', 'running', 'retryable_failed')
    do nothing
    returning 1
  )
  select count(*)::integer into scheduled from inserted;

  return scheduled;
end;
$$;

revoke all on function public.schedule_due_connector_syncs(date, integer)
  from public, anon, authenticated;
grant execute on function public.schedule_due_connector_syncs(date, integer)
  to service_role;
