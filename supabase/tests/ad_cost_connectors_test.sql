begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select has_table('private', 'connector_secrets', 'los tokens viven fuera del esquema expuesto');
select has_table('public', 'ad_cost_mappings', 'existe una bandeja de asignaciones auditables');
select has_function('public', 'persist_ad_cost_page', array['uuid', 'uuid', 'jsonb'], 'la persistencia normalizada es atómica');
select has_function('public', 'claim_connector_sync_runs', array['text', 'integer'], 'los jobs se reclaman sin bloquear otros workers');
select has_function('public', 'schedule_due_connector_syncs', array['date', 'integer'], 'el servicio programa sincronizaciones incrementales diarias');

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.ad_cost_mappings'::regclass),
  'las asignaciones manuales tienen RLS'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);

select is(
  public.upsert_manual_ad_costs(
    '20000000-0000-4000-8000-000000000001',
    '[{"provider":"manual","accountExternalId":"manual","costDate":"2026-09-15","amountMinor":"1234","currency":"EUR","impressions":"0","clicks":"0","externalRowId":"manual-fixture-1","entityStatus":"active","campaignExternalId":"creator-september","campaignName":"Creador septiembre"}]'::jsonb
  ),
  1,
  'la entrada manual diaria crea un coste exacto'
);

select is(
  public.upsert_manual_ad_costs(
    '20000000-0000-4000-8000-000000000001',
    '[{"provider":"manual","accountExternalId":"manual","costDate":"2026-09-15","amountMinor":"1250","currency":"EUR","impressions":"0","clicks":"0","externalRowId":"manual-fixture-1","entityStatus":"active","campaignExternalId":"creator-september","campaignName":"Creador septiembre corregida"}]'::jsonb
  ),
  1,
  'un dato corregido posteriormente actualiza la misma clave'
);

select ok(
  (select count(*) = 1 and max(amount_minor) = 1250 and max(correction_version) = 2
   from public.ad_costs where external_row_id = 'manual-fixture-1'),
  'la deduplicación conserva una fila e incrementa la versión de corrección'
);

select throws_ok(
  $$select public.upsert_manual_ad_costs(
    '20000000-0000-4000-8000-000000000001',
    '[{"costDate":"2026-09-15","amountMinor":"-1","currency":"EUR","externalRowId":"negative"}]'::jsonb
  )$$,
  '22023',
  'invalid manual cost row',
  'un coste manual negativo se rechaza'
);

select throws_ok(
  $$select * from private.connector_secrets$$,
  '42501',
  null,
  'el navegador autenticado no puede leer tokens cifrados'
);

select is(
  public.assign_ad_cost_campaign(
    (select id from public.ad_costs where external_row_id = 'manual-fixture-1'),
    '40000000-0000-4000-8000-000000000001'
  ),
  1,
  'un coste sin relacionar puede asignarse manualmente'
);

select ok(
  (select match_status = 'matched' and campaign_id = '40000000-0000-4000-8000-000000000001'
   from public.ad_costs where external_row_id = 'manual-fixture-1'),
  'la asignación se conserva y saca el coste de Sin relacionar'
);

select is(
  public.upsert_manual_ad_costs(
    '20000000-0000-4000-8000-000000000001',
    '[{"provider":"manual","accountExternalId":"manual","costDate":"2026-09-15","amountMinor":"1300","currency":"EUR","impressions":"0","clicks":"0","externalRowId":"manual-fixture-1","entityStatus":"active","campaignExternalId":"creator-september","campaignName":"Creador septiembre recargada"}]'::jsonb
  ),
  1,
  'una recarga aplica la asignación manual guardada'
);

select ok(
  (select campaign_id = '40000000-0000-4000-8000-000000000001' and match_status = 'matched' and amount_minor = 1300
   from public.ad_costs where external_row_id = 'manual-fixture-1'),
  'la asignación futura no vuelve a quedar Sin relacionar'
);

reset role;

insert into public.connector_accounts (
  id, organization_id, app_id, provider, external_account_id, external_account_hint,
  account_name, account_currency, api_version, connection_state, status
) values (
  'c5100000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'google_ads', '1234567890', '····7890', 'Google Fixture', 'JPY', 'v25', 'ready', 'active'
);

insert into public.connector_sync_runs (
  id, organization_id, app_id, connector_account_id, status, sync_from, sync_to,
  api_version, overlap_days, next_attempt_at
) values (
  'c5200000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'c5100000-0000-4000-8000-000000000001',
  'pending', '2026-09-10', '2026-09-12', 'v25', 3, now()
);

set local role service_role;

select is(
  (select count(*) from public.claim_connector_sync_runs('pgtap-worker', 5)),
  1::bigint,
  'el worker reclama un job incremental pendiente'
);

select is(
  public.persist_ad_cost_page(
    'c5100000-0000-4000-8000-000000000001',
    'c5200000-0000-4000-8000-000000000001',
    '[{"provider":"google_ads","accountExternalId":"1234567890","costDate":"2026-09-11","amountMinor":"2","currency":"JPY","impressions":"100","clicks":"5","externalRowId":"google:deleted-campaign","entityStatus":"deleted","campaignExternalId":"deleted-42","campaignName":"Campaña eliminada","adGroupExternalId":"group-7","adGroupName":"Grupo histórico","adExternalId":"ad-9","adName":"Anuncio histórico"}]'::jsonb
  ),
  1,
  'la campaña eliminada permanece en el histórico de costes'
);

select ok(
  (select cost.amount_minor = 2 and cost.currency = 'JPY' and campaign.status = 'disabled'
   from public.ad_costs cost
   join public.campaigns campaign on campaign.id = cost.campaign_id
   where cost.external_row_id = 'google:deleted-campaign'),
  'el coste conserva moneda y estado histórico sin conversión'
);

select is(
  public.persist_ad_cost_page(
    'c5100000-0000-4000-8000-000000000001',
    'c5200000-0000-4000-8000-000000000001',
    '[{"provider":"google_ads","accountExternalId":"1234567890","costDate":"2026-09-11","amountMinor":"3","currency":"JPY","impressions":"110","clicks":"6","externalRowId":"google:deleted-campaign","entityStatus":"deleted","campaignExternalId":"deleted-42","campaignName":"Campaña eliminada","adGroupExternalId":"group-7","adGroupName":"Grupo histórico","adExternalId":"ad-9","adName":"Anuncio histórico"}]'::jsonb
  ),
  1,
  'una corrección tardía del proveedor se procesa con la misma fila externa'
);

select ok(
  (select amount_minor = 3 and correction_version = 2
   from public.ad_costs where external_row_id = 'google:deleted-campaign'),
  'la corrección tardía sustituye el importe y conserva auditoría'
);

reset role;
set local role service_role;

update public.connector_sync_runs
set status = 'succeeded', finished_at = now()
where connector_account_id = 'c5100000-0000-4000-8000-000000000001';

update public.connector_accounts
set last_synced_at = '2026-09-16 23:00:00+00'
where id = 'c5100000-0000-4000-8000-000000000001';

select is(
  public.schedule_due_connector_syncs('2026-09-17', 100),
  1,
  'el job diario vuelve a leer el solapamiento de seguridad'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);

select is(
  public.enqueue_connector_sync('c5100000-0000-4000-8000-000000000001', '2026-09-13', '2026-09-16'),
  public.enqueue_connector_sync('c5100000-0000-4000-8000-000000000001', '2026-09-13', '2026-09-16'),
  'dos solicitudes del mismo rango deduplican el job'
);

select is(
  (select count(distinct currency) from public.ad_costs where app_id = '20000000-0000-4000-8000-000000000001' and currency in ('EUR', 'JPY')),
  2::bigint,
  'las monedas diferentes permanecen separadas y no se convierten sin fuente de cambio'
);

select is(
  (select count(*) from public.read_ad_cost_totals('20000000-0000-4000-8000-000000000001')),
  2::bigint,
  'el dashboard agrega todas las filas en servidor sin un límite de página'
);

select * from finish();
rollback;
