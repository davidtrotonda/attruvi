-- Representative CPU benchmark for the five metric hierarchy expansions.
-- Run with: psql "$DATABASE_URL" -f supabase/benchmarks/metrics_rollup.sql
-- It creates no persistent rows and models one million daily acquisition facts.
explain (analyze, buffers, format text)
with synthetic_installations as materialized (
  select
    sequence as installation_id,
    date '2026-01-01' + (sequence % 90)::integer as metric_date,
    (sequence % 8)::integer as source_id,
    (sequence % 80)::integer as campaign_id,
    (sequence % 800)::integer as ad_group_id,
    (sequence % 8000)::integer as ad_id,
    (sequence % 5 = 0)::integer as registered,
    (sequence % 20 = 0)::integer as buyer,
    (sequence % 20 = 0)::integer * 4990 as revenue_minor,
    1 + (sequence % 6)::integer as sessions,
    (sequence % 3 = 0)::integer as retained_d1
  from generate_series(1, 1000000) sequence
), expanded as (
  select fact.*, dimension.metric_level, dimension.dimension_id
  from synthetic_installations fact
  cross join lateral (
    values
      ('app'::text, 0),
      ('source', fact.source_id),
      ('campaign', fact.campaign_id),
      ('ad_group', fact.ad_group_id),
      ('ad', fact.ad_id)
  ) dimension(metric_level, dimension_id)
), rollup as (
  select metric_date, metric_level, dimension_id,
         count(*)::bigint as installs,
         sum(registered)::bigint as registered_users,
         sum(buyer)::bigint as buyers,
         sum(revenue_minor)::bigint as revenue_minor,
         sum(sessions)::bigint as sessions,
         sum(retained_d1)::bigint as retained_d1
  from expanded
  group by metric_date, metric_level, dimension_id
)
select sum(installs), sum(registered_users), sum(buyers), sum(revenue_minor),
       sum(sessions), sum(retained_d1)
from rollup;
