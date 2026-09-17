begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select has_table(
  'public', 'attribution_rule_sets',
  'las reglas de atribución están versionadas por app'
);

select has_function(
  'public', 'attribute_installation',
  array['uuid', 'uuid', 'attribution_scope', 'uuid', 'timestamp with time zone', 'jsonb', 'text', 'boolean'],
  'existe el servicio idempotente de atribución'
);

insert into public.link_clicks (
  id, organization_id, app_id, smart_link_id, request_id, clicked_at,
  platform_hint, destination_platform, fbclid, network_prefix_hash,
  user_agent_hash, dedupe_key
) values
  (
    'f1000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    'f1100000-0000-4000-8000-000000000001',
    '2026-09-17T09:00:00Z', 'android', 'android', 'shared-fbclid',
    extensions.digest('shared-network', 'sha256'),
    extensions.digest('shared-agent', 'sha256'), 'attr-test-click-1'
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002',
    'f1100000-0000-4000-8000-000000000002',
    '2026-09-17T09:30:00Z', 'android', 'android', 'shared-fbclid',
    extensions.digest('shared-network', 'sha256'),
    extensions.digest('shared-agent', 'sha256'), 'attr-test-click-2'
  ),
  (
    'f1000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000003',
    'f1100000-0000-4000-8000-000000000003',
    '2026-08-01T09:00:00Z', 'android', 'android', 'expired-fbclid',
    extensions.digest('expired-network', 'sha256'),
    extensions.digest('expired-agent', 'sha256'), 'attr-test-click-3'
  );

insert into public.installations (
  id, organization_id, app_id, installation_key_hash, platform, environment,
  first_open_at, last_seen_at, sdk_version, consent_state
)
select
  ('f2000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  extensions.digest('attribution-test-install-' || n, 'sha256'),
  case when n = 7 then 'ios' else 'android' end::public.app_platform_kind,
  'development',
  '2026-09-17T10:00:00Z', '2026-09-17T10:00:00Z', '0.1.0',
  case when n in (6, 7) then 'limited' else 'granted' end
from generate_series(1, 8) series(n);

select public.attribute_installation(
  '20000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'acquisition',
  'f2000000-0000-4000-8000-000000000001',
  '2026-09-17T10:00:00Z',
  '{"method":"direct_link","clickId":"f1000000-0000-4000-8000-000000000001"}',
  null, false
);

select is(
  (
    select match_type::text from public.attributions
    where installation_id = 'f2000000-0000-4000-8000-000000000001' and is_current
  ),
  'direct_link',
  'un click_id directo gana con evidencia determinista'
);

select public.attribute_installation(
  '20000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000002',
  'acquisition',
  'f2000000-0000-4000-8000-000000000002',
  '2026-09-17T10:00:00Z',
  '{"method":"install_referrer","clickId":"f1000000-0000-4000-8000-000000000001"}',
  null, false
);

select is(
  (
    select match_type::text from public.attributions
    where installation_id = 'f2000000-0000-4000-8000-000000000002' and is_current
  ),
  'install_referrer',
  'Android Play Install Referrer se conserva como método propio'
);

select public.attribute_installation(
  '20000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000003',
  'acquisition',
  'f2000000-0000-4000-8000-000000000003',
  '2026-09-17T10:00:00Z',
  '{"method":"direct_link","fbclid":"shared-fbclid"}',
  null, false
);

select is(
  (
    select click_id::text from public.attributions
    where installation_id = 'f2000000-0000-4000-8000-000000000003' and is_current
  ),
  'f1000000-0000-4000-8000-000000000002',
  'dos candidatos del mismo nivel eligen el último clic no orgánico'
);

select ok(
  (
    select count(*) >= 3 from public.attribution_candidates
    where installation_id = 'f2000000-0000-4000-8000-000000000003'
  ),
  'la decisión conserva y explica los candidatos competidores y el fallback'
);

select public.attribute_installation(
  '20000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000004',
  'acquisition',
  'f2000000-0000-4000-8000-000000000004',
  '2026-09-17T10:00:00Z',
  '{"method":"direct_link","clickId":"f1000000-0000-4000-8000-000000000003"}',
  null, false
);

select is(
  (
    select match_type::text from public.attributions
    where installation_id = 'f2000000-0000-4000-8000-000000000004' and is_current
  ),
  'organic',
  'un clic expirado no se fuerza y cae en orgánico'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);

select lives_ok(
  $$
    select public.correct_personal_attribution(
      '20000000-0000-4000-8000-000000000001',
      'f2000000-0000-4000-8000-000000000004',
      'acquisition',
      'f2000000-0000-4000-8000-000000000004',
      '{"sourceId":"30000000-0000-4000-8000-000000000001"}'::jsonb,
      'Corrección ficticia de prueba'
    )
  $$,
  'owner puede corregir manualmente con motivo'
);

reset role;

select ok(
  (
    select match_type = 'manual' and is_manual
    from public.attributions
    where installation_id = 'f2000000-0000-4000-8000-000000000004' and is_current
  ) and exists (
    select 1 from public.audit_log
    where target_id = 'f2000000-0000-4000-8000-000000000004'
      and action = 'attribution.corrected'
  ),
  'la corrección conserva la decisión manual y su auditoría'
);

select public.attribute_installation(
  '20000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'acquisition',
  'f2000000-0000-4000-8000-000000000001',
  '2026-09-17T10:00:00Z',
  '{"method":"direct_link","clickId":"f1000000-0000-4000-8000-000000000001"}',
  null, false
);

select ok(
  (
    select count(*) = 1 from public.attributions
    where installation_id = 'f2000000-0000-4000-8000-000000000001'
      and scope = 'acquisition' and rule_version = 'v1'
  ) and (
    select count(*) = 1 from public.attribution_candidates
    where installation_id = 'f2000000-0000-4000-8000-000000000001'
      and candidate_key = 'explicit-click:f1000000-0000-4000-8000-000000000001'
      and rule_version = 'v1'
  ),
  'un primer open duplicado no duplica decisión ni candidato'
);

select public.attribute_installation(
  '20000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000005',
  'acquisition',
  'f2000000-0000-4000-8000-000000000005',
  '2026-09-17T10:00:00Z',
  '{"method":"direct_link","clickId":"f1000000-0000-4000-8000-000000000001"}',
  null, false
);

select is(
  (
    select count(*) from public.attributions
    where installation_id in (
      'f2000000-0000-4000-8000-000000000001',
      'f2000000-0000-4000-8000-000000000005'
    ) and is_current
  ),
  2::bigint,
  'una reinstalación con installation_id nuevo obtiene su propia adquisición'
);

insert into public.sessions (
  id, organization_id, app_id, installation_id, session_key, started_at
) values (
  'f3000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'reengagement-test', '2026-09-17T10:00:00Z'
);

select public.attribute_installation(
  '20000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'reengagement',
  'f3000000-0000-4000-8000-000000000001',
  '2026-09-17T10:00:00Z',
  '{"method":"direct_link","clickId":"f1000000-0000-4000-8000-000000000002","capturedAt":"2026-09-17T09:59:00Z"}',
  null, false
);

select is(
  (
    select count(*) from public.attributions
    where installation_id = 'f2000000-0000-4000-8000-000000000001'
      and is_current
  ),
  2::bigint,
  'la reactivación convive con la adquisición y queda ligada a su sesión'
);

select is(
  (
    select match_type::text from public.attributions
    where installation_id = 'f2000000-0000-4000-8000-000000000001'
      and scope = 'reengagement' and is_current
  ),
  'direct_link',
  'la reactivación exige una señal directa capturada cerca de la sesión'
);

select public.attribute_installation(
  '20000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000006',
  'acquisition',
  'f2000000-0000-4000-8000-000000000006',
  '2026-09-17T10:00:00Z',
  '{"method":"direct_link","fbclid":"shared-fbclid"}',
  null, false
);

select is(
  (
    select match_type::text from public.attributions
    where installation_id = 'f2000000-0000-4000-8000-000000000006' and is_current
  ),
  'organic',
  'sin consentimiento completo no se usan identificadores oficiales de red'
);

select public.attribute_installation(
  '20000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000007',
  'acquisition',
  'f2000000-0000-4000-8000-000000000007',
  '2026-09-17T10:00:00Z', '{}'::jsonb, null, false
);

select ok(
  (
    select match_type = 'organic' and confidence < 0.5
    from public.attributions
    where installation_id = 'f2000000-0000-4000-8000-000000000007' and is_current
  ),
  'iOS sin señal permitida se etiqueta como orgánico y no determinista'
);

select public.attribute_installation(
  '20000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000008',
  'acquisition',
  'f2000000-0000-4000-8000-000000000008',
  '2026-09-17T10:00:00Z',
  jsonb_build_object(
    'probabilisticEvidence', jsonb_build_object(
      'networkPrefixHash', encode(extensions.digest('shared-network', 'sha256'), 'hex'),
      'userAgentHash', encode(extensions.digest('shared-agent', 'sha256'), 'hex')
    )
  ),
  null, false
);

select is(
  (
    select match_type::text from public.attributions
    where installation_id = 'f2000000-0000-4000-8000-000000000008' and is_current
  ),
  'organic',
  'la coincidencia probabilística está desactivada por defecto'
);

insert into public.attribution_rule_sets (
  organization_id, app_id, version, status, acquisition_window_days,
  reengagement_window_hours
) values (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'v2-dry-run', 'draft', 1, 12
);

select is(
  public.attribute_installation(
    '20000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001',
    'acquisition',
    'f2000000-0000-4000-8000-000000000001',
    '2026-09-17T10:00:00Z',
    '{"method":"direct_link","clickId":"f1000000-0000-4000-8000-000000000001"}',
    'v2-dry-run', true
  ) ->> 'wouldChange',
  'true',
  'una versión nueva muestra la diferencia en dry-run'
);

select is(
  (
    select count(*) from public.attributions
    where installation_id = 'f2000000-0000-4000-8000-000000000001'
      and rule_version = 'v2-dry-run'
  ),
  0::bigint,
  'el dry-run no persiste ninguna decisión'
);

select is(
  (
    select source_name from public.attributions
    where installation_id = 'f2000000-0000-4000-8000-000000000001'
      and scope = 'acquisition' and is_current
  ),
  'Google Ads',
  'la decisión conserva el nombre histórico de la fuente'
);

select ok(
  (select count(*) >= 6 from public.sources where app_id = '20000000-0000-4000-8000-000000000001')
  and exists (select 1 from public.sources where kind = 'google_ads')
  and exists (select 1 from public.sources where kind = 'meta_ads')
  and exists (select 1 from public.sources where kind = 'tiktok_ads')
  and exists (select 1 from public.sources where kind = 'affiliate')
  and exists (select 1 from public.sources where kind = 'influencer')
  and exists (select 1 from public.sources where kind = 'organic'),
  'los fixtures cubren Google, Meta, TikTok, afiliado, influencer y orgánico'
);

select is(
  (
    public.get_attribution_explanation(
      '20000000-0000-4000-8000-000000000001',
      'f2000000-0000-4000-8000-000000000003',
      'acquisition', null
    ) #>> '{attribution,decisionReason}'
  ) is not null,
  true,
  'el dashboard puede consultar por qué ganó una atribución'
);

select * from finish();
rollback;
