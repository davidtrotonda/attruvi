-- Aggregate on the server so the dashboard never under-counts when raw cost
-- rows exceed the PostgREST page limit.  RLS remains authoritative because the
-- function deliberately uses the caller's privileges.
create or replace function public.read_ad_cost_totals(requested_app_id uuid)
returns table(currency text, amount_minor numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select cost.currency, sum(cost.amount_minor)::numeric as amount_minor
  from public.ad_costs cost
  where cost.app_id = requested_app_id
  group by cost.currency
  order by cost.currency;
$$;

revoke all on function public.read_ad_cost_totals(uuid) from public, anon;
grant execute on function public.read_ad_cost_totals(uuid) to authenticated, service_role;
