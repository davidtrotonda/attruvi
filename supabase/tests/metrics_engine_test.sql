begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select has_table('public', 'metric_dirty_days', 'los cambios tardíos se registran por cohorte');
select has_table('public', 'metric_rollup_runs', 'cada recálculo deja una ejecución auditable');
select has_table('public', 'metric_reconciliation_runs', 'las reconciliaciones quedan auditadas');
select has_function(
  'public', 'recalculate_daily_metrics',
  array['uuid', 'environment_kind', 'date', 'date', 'text', 'timestamp with time zone'],
  'existe el recálculo versionado'
);
select has_function(
  'public', 'query_metric_rollups',
  array['uuid', 'environment_kind', 'date', 'date', 'text', 'text', 'app_platform_kind', 'uuid', 'text'],
  'existe la consulta agregada server-side'
);
select ok(
  (select count(*) = 3
   from pg_catalog.pg_class relation
   join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relname = any(array[
       'metric_dirty_days', 'metric_rollup_runs', 'metric_reconciliation_runs'
     ])
     and relation.relrowsecurity),
  'todas las tablas operativas del motor tienen RLS'
);

insert into public.sources (id, organization_id, app_id, kind, name, external_id)
values
  (
    'f3000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'google_ads', 'Google métricas exactas', 'metrics-source-1'
  ),
  (
    'f3000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'manual', 'Fuente sin instalaciones', 'metrics-source-2'
  );

insert into public.campaigns (
  id, organization_id, app_id, source_id, name, external_id
) values (
  'f4000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001', 'Campaña exacta', 'metrics-campaign-1'
);

insert into public.ad_groups (
  id, organization_id, app_id, source_id, campaign_id, name, external_id
) values (
  'f5000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001', 'Grupo exacto', 'metrics-group-1'
);

insert into public.ads (
  id, organization_id, app_id, source_id, campaign_id, ad_group_id, name, external_id
) values (
  'f6000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000001', 'Anuncio exacto', 'metrics-ad-1'
);

insert into public.installations (
  id, organization_id, app_id, installation_key_hash, platform, environment,
  first_open_at, last_seen_at
) values
  (
    'f7000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    extensions.digest('metrics-install-1', 'sha256'), 'android', 'development',
    '2026-01-01T09:00:00Z', '2026-01-08T10:10:00Z'
  ),
  (
    'f7000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    extensions.digest('metrics-install-2', 'sha256'), 'android', 'development',
    '2026-01-01T11:00:00Z', '2026-01-01T12:10:00Z'
  );

select private.ensure_installation_app_user(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000001', '2026-01-01T09:00:00Z'
);
select private.ensure_installation_app_user(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000002', '2026-01-01T11:00:00Z'
);

insert into public.attributions (
  organization_id, app_id, installation_id, scope, engagement_id,
  method, match_type, confidence, evidence_summary, attribution_window_days,
  attribution_window_seconds, decision_reason, source_id, campaign_id,
  ad_group_id, ad_id, rule_version, attributed_at
)
select
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', installation.id,
  'acquisition', installation.id, 'manual', 'manual', 1,
  '{"fixture":"metrics"}'::jsonb, 7, 604800, 'Fixture calculable a mano.',
  'f3000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000001',
  'metrics-test-v1', installation.first_open_at
from public.installations installation
where installation.id in (
  'f7000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000002'
);

insert into public.events (
  id, organization_id, app_id, installation_id, event_id, idempotency_key,
  name, occurred_at, properties
) values
  (
    'f8100000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',
    'f8200000-0000-4000-8000-000000000001', 'metrics-sign-up',
    'sign_up', '2026-01-01T10:00:00Z', '{}'::jsonb
  ),
  (
    'f8100000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',
    'f8200000-0000-4000-8000-000000000002', 'metrics-purchase',
    'purchase', '2026-01-02T10:00:00Z', '{}'::jsonb
  ),
  (
    'f8100000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',
    'f8200000-0000-4000-8000-000000000003', 'metrics-refund',
    'refund', '2026-01-05T10:00:00Z', '{}'::jsonb
  );

insert into public.activity_sessions (
  id, organization_id, app_id, app_user_id, installation_id, session_key,
  started_at, last_activity_at, event_count, timeout_minutes
) values
  ('f8300000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','metrics-s1','2026-01-01T10:00:00Z','2026-01-01T10:10:00Z',1,30),
  ('f8300000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','metrics-s2','2026-01-02T10:00:00Z','2026-01-02T10:10:00Z',1,30),
  ('f8300000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','metrics-s3','2026-01-08T10:00:00Z','2026-01-08T10:10:00Z',1,30),
  ('f8300000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000002','f7000000-0000-4000-8000-000000000002','metrics-s4','2026-01-01T12:00:00Z','2026-01-01T12:10:00Z',1,30);

insert into public.revenue_ledger (
  organization_id, app_id, app_user_id, installation_id, event_id, event_type,
  transaction_id, revenue_reported_minor, currency, occurred_at
) values
  ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000002','purchase','metrics-p1',5000,'EUR','2026-01-02T10:00:00Z'),
  ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000003','refund','metrics-r1',-1000,'EUR','2026-01-05T10:00:00Z');

insert into public.uninstall_inferences (
  organization_id, app_id, installation_id, inferred_at, evidence,
  confidence, signal_type
) values (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000002', '2026-02-01T10:00:00Z',
  '{"fixture":true}'::jsonb, 0.85, 'persistent_push_token_invalidation'
);

insert into public.ad_costs (
  organization_id, app_id, source_id, campaign_id, ad_group_id, ad_id,
  provider, environment, cost_date, amount_minor, currency, clicks,
  external_row_id, match_status
) values
  ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000001','google_ads','development','2026-01-01',10000,'EUR',100,'metrics-cost-1','matched'),
  ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002',null,null,null,'manual','development','2026-01-01',1000,'EUR',10,'metrics-cost-zero','manual');

select set_config('request.jwt.claim.role', 'service_role', true);
select public.recalculate_daily_metrics(
  '20000000-0000-4000-8000-000000000001', 'development',
  '2026-01-01', '2026-01-01', 'metrics-test-v1', '2026-04-02T23:59:59Z'
);

create temporary table exact_metric_result as
select * from public.query_metric_rollups(
  '20000000-0000-4000-8000-000000000001', 'development',
  '2026-01-01', '2026-01-01', 'source', 'EUR', null,
  'f3000000-0000-4000-8000-000000000001', 'total'
);

select is((select spend_minor from exact_metric_result), 10000::bigint, 'spend suma unidades menores exactas');
select is((select clicks from exact_metric_result), 100::bigint, 'clicks usa el dato de la red');
select is((select installs from exact_metric_result), 2::bigint, 'installs cuenta instalaciones distintas');
select is((select cpi_minor from exact_metric_result), 5000::numeric, 'CPI = 10000 / 2');
select is((select registered_users from exact_metric_result), 1::bigint, 'registro cuenta usuarios distintos');
select is((select registration_rate from exact_metric_result), 0.5::numeric, 'registro / instalaciones = 1 / 2');
select is((select buyers from exact_metric_result), 1::bigint, 'compradores cuenta usuarios con ingreso positivo');
select is((select cac_minor from exact_metric_result), 10000::numeric, 'CAC = 10000 / 1');
select is((select purchases from exact_metric_result), 1::bigint, 'el reembolso no aumenta compras');
select is((select revenue_minor from exact_metric_result), 4000::bigint, 'revenue neto = 5000 - 1000');
select is((select roas from exact_metric_result), 0.4::numeric, 'ROAS = 4000 / 10000');
select is((select retention_d1 from exact_metric_result), 0.5::numeric, 'retención D1 = 1 / 2 elegibles');
select is((select retention_d7 from exact_metric_result), 0.5::numeric, 'retención D7 = 1 / 2 elegibles');
select is((select retention_d30 from exact_metric_result), 0::numeric, 'retención D30 = 0 / 2 elegibles');
select is((select sessions_per_user from exact_metric_result), 2::numeric, 'sesiones por usuario = 4 / 2');
select is((select observed_ltv_d7_minor from exact_metric_result), 2000::numeric, 'LTV D7 = 4000 / 2 usuarios maduros');
select is((select observed_ltv_d30_minor from exact_metric_result), 2000::numeric, 'LTV D30 conserva el reembolso dentro de la ventana');
select is((select observed_ltv_d90_minor from exact_metric_result), 2000::numeric, 'LTV D90 usa solo cohortes maduras');
select is((select observed_ltv_lifetime_minor from exact_metric_result), 2000::numeric, 'LTV lifetime = revenue observado / usuarios');
select is((select uninstall_inferred_rate from exact_metric_result), 0.5::numeric, 'la tasa de desinstalación se etiqueta como inferida');

select ok(
  (select cpi_minor is null and cac_minor is null and roas = 0
   from public.query_metric_rollups(
     '20000000-0000-4000-8000-000000000001', 'development',
     '2026-01-01', '2026-01-01', 'source', 'EUR', null,
     'f3000000-0000-4000-8000-000000000002', 'total'
   )),
  'los denominadores cero producen NULL y nunca infinito'
);

select ok(
  (public.reconcile_daily_metrics(
    '20000000-0000-4000-8000-000000000001', 'development',
    '2026-01-01', '2026-01-01', 'metrics-test-v1', '2026-04-02T23:59:59Z'
  ) ->> 'matches')::boolean,
  'el reconciliador confirma que rollup y raw coinciden'
);

insert into public.activity_sessions (
  id, organization_id, app_id, app_user_id, installation_id, session_key,
  started_at, last_activity_at, event_count, timeout_minutes
) values (
  'f8300000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'f7000000-0000-4000-8000-000000000002',
  'f7000000-0000-4000-8000-000000000002', 'metrics-late-d30',
  '2026-01-31T12:00:00Z', '2026-01-31T12:10:00Z', 1, 30
);

select ok(
  exists (
    select 1 from public.metric_dirty_days
    where app_id = '20000000-0000-4000-8000-000000000001'
      and environment = 'development' and metric_date = '2026-01-01'
  ),
  'un dato tardío marca la fecha de cohorte para recálculo'
);
select isnt(
  (public.reconcile_daily_metrics(
    '20000000-0000-4000-8000-000000000001', 'development',
    '2026-01-01', '2026-01-01', 'metrics-test-v1', '2026-04-02T23:59:59Z'
  ) ->> 'differingRows')::integer,
  0,
  'el reconciliador detecta una desviación tras un dato tardío'
);

select public.recalculate_daily_metrics(
  '20000000-0000-4000-8000-000000000001', 'development',
  '2026-01-01', '2026-01-01', 'metrics-test-v1', '2026-04-02T23:59:59Z'
);
select ok(
  (public.reconcile_daily_metrics(
    '20000000-0000-4000-8000-000000000001', 'development',
    '2026-01-01', '2026-01-01', 'metrics-test-v1', '2026-04-02T23:59:59Z'
  ) ->> 'matches')::boolean,
  'el recálculo incremental elimina la desviación'
);

select is(
  (select count(*) from public.events where id::text like 'f81%'),
  3::bigint,
  'los rollups y recálculos conservan los datos raw'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  'f9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'metrics-outsider@attruvi.invalid', extensions.crypt('test-only', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now(), '', '', ''
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select * from public.query_metric_rollups(
    '20000000-0000-4000-8000-000000000001', 'development',
    '2026-01-01', '2026-01-01', 'source', 'EUR', null, null, 'total'
  )$$,
  '42501', 'forbidden',
  'una sesión ajena no puede consultar los rollups de otra organización'
);
reset role;

select * from finish();
rollback;
