begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select has_table('public', 'app_users', 'los perfiles anónimos existen');
select has_table('public', 'revenue_ledger', 'los ingresos usan un libro mayor');
select has_function(
  'public', 'ingest_sdk_messages_v3', array['jsonb'],
  'la ingestión procesa actividad posterior a la instalación'
);

select ok(
  (select count(*) = 10
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any(array[
        'app_users', 'app_user_installations', 'activity_sessions', 'revenue_ledger',
        'revenue_validations', 'subscription_events', 'push_token_invalidations',
        'uninstall_inferences', 'installation_activity_metrics', 'app_user_metrics'
      ])
      and relation.relrowsecurity),
  'todas las tablas nuevas tienen RLS de denegación por defecto'
);

insert into public.installations (
  id, organization_id, app_id, installation_key_hash, platform, environment,
  first_open_at, last_seen_at, sdk_version, consent_state
) values (
  'a7100000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  extensions.digest('activity-test-install-1', 'sha256'), 'android', 'development',
  '2026-09-17T10:00:00Z', '2026-09-17T13:00:00Z', '0.1.0', 'granted'
);

insert into public.events (
  id, organization_id, app_id, installation_id, event_id, idempotency_key,
  name, occurred_at, properties, value_minor, currency
) values
  (
    'a7200000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    'a7300000-0000-4000-8000-000000000001', 'activity-install',
    'install', '2026-09-17T10:00:00Z', '{}'::jsonb, null, null
  ),
  (
    'a7200000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    'a7300000-0000-4000-8000-000000000002', 'activity-open',
    'app_open', '2026-09-17T10:20:00Z', '{}'::jsonb, null, null
  ),
  (
    'a7200000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    'a7300000-0000-4000-8000-000000000003', 'activity-signup',
    'sign_up', '2026-09-17T10:51:00Z', '{}'::jsonb, null, null
  ),
  (
    'a7200000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    'a7300000-0000-4000-8000-000000000004', 'activity-purchase-1',
    'purchase', '2026-09-17T11:00:00Z',
    '{"transactionId":"order-activity-1","orderId":"order-1","valueMinor":"4990","currency":"EUR","quantity":1,"products":[{"productId":"premium","quantity":1}]}'::jsonb,
    4990, 'EUR'
  ),
  (
    'a7200000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    'a7300000-0000-4000-8000-000000000005', 'activity-purchase-duplicate',
    'purchase', '2026-09-17T11:01:00Z',
    '{"transactionId":"order-activity-1","valueMinor":"4990","currency":"EUR"}'::jsonb,
    4990, 'EUR'
  ),
  (
    'a7200000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    'a7300000-0000-4000-8000-000000000006', 'activity-refund',
    'refund', '2026-09-17T11:10:00Z',
    '{"transactionId":"refund-activity-1","originalTransactionId":"order-activity-1","valueMinor":"-990","currency":"EUR"}'::jsonb,
    -990, 'EUR'
  ),
  (
    'a7200000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    'a7300000-0000-4000-8000-000000000007', 'activity-usd',
    'purchase', '2026-09-17T11:20:00Z',
    '{"transactionId":"order-usd-1","valueMinor":"1250","currency":"USD"}'::jsonb,
    1250, 'USD'
  ),
  (
    'a7200000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    'a7300000-0000-4000-8000-000000000008', 'activity-sub-start',
    'subscription_started', '2026-09-17T11:30:00Z',
    '{"transactionId":"sub-payment-1","subscriptionId":"subscription-activity","productId":"monthly","valueMinor":"999","currency":"EUR"}'::jsonb,
    999, 'EUR'
  ),
  (
    'a7200000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    'a7300000-0000-4000-8000-000000000009', 'activity-sub-renewal',
    'subscription_renewed', '2026-10-17T11:30:00Z',
    '{"transactionId":"sub-payment-2","subscriptionId":"subscription-activity","productId":"monthly","valueMinor":"999","currency":"EUR"}'::jsonb,
    999, 'EUR'
  );

select private.process_installation_activity('a7100000-0000-4000-8000-000000000001');

select is(
  (select session_count from public.installation_activity_metrics
    where installation_id = 'a7100000-0000-4000-8000-000000000001'),
  3,
  'una sesión nueva comienza tras 30 minutos de inactividad y tolera eventos fuera de orden'
);

update public.apps set session_timeout_minutes = 60
where id = '20000000-0000-4000-8000-000000000001';
select private.process_installation_activity('a7100000-0000-4000-8000-000000000001');

select is(
  (select count(*)::integer from public.activity_sessions
    where installation_id = 'a7100000-0000-4000-8000-000000000001'),
  2,
  'el umbral de sesión es configurable por app'
);

select is(
  (select count(*) from public.revenue_ledger
    where app_id = '20000000-0000-4000-8000-000000000001'
      and transaction_id = 'order-activity-1' and event_type = 'purchase'),
  1::bigint,
  'una compra duplicada se deduplica por app, transacción y tipo'
);

select is(
  (select revenue_reported_minor from public.revenue_ledger
    where transaction_id = 'refund-activity-1'),
  (-990)::bigint,
  'un reembolso es un apunte contable negativo'
);

select is(
  (select lifecycle_status from public.subscriptions
    where external_subscription_id = 'subscription-activity'),
  'active',
  'una renovación deja la suscripción activa aunque llegue fuera de orden'
);

select is(
  (select revenue_reported_minor from public.subscriptions
    where external_subscription_id = 'subscription-activity'),
  1998::bigint,
  'las renovaciones se acumulan desde transacciones deduplicadas'
);

select is(
  (select revenue_reported_by_currency ->> 'EUR' from public.installation_activity_metrics
    where installation_id = 'a7100000-0000-4000-8000-000000000001'),
  '5998',
  'el ingreso acumulado incluye compras, suscripciones y reembolsos'
);

select is(
  (select revenue_reported_by_currency ->> 'USD' from public.installation_activity_metrics
    where installation_id = 'a7100000-0000-4000-8000-000000000001'),
  '1250',
  'las monedas diferentes se mantienen en cubos separados'
);

select ok(
  (select signed_up_at is not null and first_purchase_at is not null and payer_status = 'reported'
    from public.installation_activity_metrics
    where installation_id = 'a7100000-0000-4000-8000-000000000001'),
  'las métricas fiables conservan registro, primera compra y estado de pago'
);

select private.link_identified_user(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'a7100000-0000-4000-8000-000000000001',
  extensions.digest('known-user-activity', 'sha256'), '2026-09-17T12:00:00Z'
);

select ok(
  (select canonical_user_hash is not null and identified_at is not null
    from public.app_users where id = 'a7100000-0000-4000-8000-000000000001'),
  'una identidad anónima que se registra conserva el mismo historial'
);

select throws_ok(
  $$select private.link_identified_user(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    extensions.digest('different-known-user', 'sha256'), '2026-09-17T12:01:00Z'
  )$$,
  '23514', 'identity_conflict',
  'dos usuarios conocidos no se fusionan por error'
);

insert into public.installations (
  id, organization_id, app_id, installation_key_hash, platform, environment,
  first_open_at, last_seen_at, sdk_version, consent_state
) values (
  'a7100000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  extensions.digest('activity-test-install-2', 'sha256'), 'ios', 'development',
  '2026-11-01T10:00:00Z', '2026-11-01T10:00:00Z', '0.1.0', 'limited'
);
select private.ensure_installation_app_user(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'a7100000-0000-4000-8000-000000000002', '2026-11-01T10:00:00Z'
);
select private.link_identified_user(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'a7100000-0000-4000-8000-000000000002',
  extensions.digest('known-user-activity', 'sha256'), '2026-11-01T10:01:00Z'
);

select is(
  (select count(*) from public.app_user_installations
    where app_user_id = 'a7100000-0000-4000-8000-000000000001'),
  2::bigint,
  'una reinstalación del mismo usuario enlaza otra instalación sin perder la anterior'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  'a7400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'activity-other@attruvi.invalid', extensions.crypt('test-only', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now(), '', '', ''
);
insert into public.organizations (id, name, slug, created_by)
values ('a7500000-0000-4000-8000-000000000001', 'Activity Other', 'activity-other', 'a7400000-0000-4000-8000-000000000001');
insert into public.organization_members (organization_id, user_id, role)
values ('a7500000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000001', 'owner');
insert into public.apps (id, organization_id, name, slug)
values ('a7600000-0000-4000-8000-000000000001', 'a7500000-0000-4000-8000-000000000001', 'Other App', 'other-app');
insert into public.installations (
  id, organization_id, app_id, installation_key_hash, platform, environment,
  first_open_at, last_seen_at
) values (
  'a7700000-0000-4000-8000-000000000001',
  'a7500000-0000-4000-8000-000000000001',
  'a7600000-0000-4000-8000-000000000001', extensions.digest('other-install', 'sha256'),
  'android', 'development', '2026-09-17T10:00:00Z', '2026-09-17T10:00:00Z'
);
select private.ensure_installation_app_user(
  'a7500000-0000-4000-8000-000000000001',
  'a7600000-0000-4000-8000-000000000001',
  'a7700000-0000-4000-8000-000000000001', '2026-09-17T10:00:00Z'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
select is(
  (select count(*) from public.app_users where app_id = 'a7600000-0000-4000-8000-000000000001'),
  0::bigint,
  'un miembro no puede leer la actividad de otra organización'
);
reset role;

select ok(
  (select attribution_id is not null and attribution_campaign_name = 'Búsqueda otoño'
    from public.events where id = 'b2000000-0000-4000-8000-000000000001'),
  'cada evento conserva una instantánea de la atribución original'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.record_push_token_invalidation(
    '20000000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001', 'fcm', repeat('a', 64),
    'UNREGISTERED', '2026-09-17T12:00:00Z'
  ) ->> 'inferred',
  'false',
  'una señal push aislada no se llama desinstalación confirmada'
);

select is(
  public.record_push_token_invalidation(
    '20000000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001', 'fcm', repeat('a', 64),
    'UNREGISTERED', '2026-09-18T13:00:00Z'
  ) ->> 'inferred',
  'true',
  'una invalidación persistente crea uninstall_inferred con evidencia real'
);

select ok(
  (select confidence = 0.8500 and evidence ->> 'invalidCount' = '2'
    from public.uninstall_inferences
    where installation_id = 'a7100000-0000-4000-8000-000000000001'),
  'la inferencia guarda fecha, evidencia y confianza'
);

select public.erase_app_user(
  '20000000-0000-4000-8000-000000000001',
  'a7100000-0000-4000-8000-000000000001'
);

select ok(
  (select deleted_at is not null and canonical_user_hash is null
    from public.app_users where id = 'a7100000-0000-4000-8000-000000000001')
  and (select count(*) > 0 from public.events
    where app_user_id = 'a7100000-0000-4000-8000-000000000001'),
  'el borrado de usuario elimina su identidad pero conserva el historial contable anónimo'
);

select is(
  (select ltv_observed_minor from public.app_user_metrics
    where app_user_id = 'a7100000-0000-4000-8000-000000000001'),
  5998::bigint,
  'el LTV observado usa la moneda configurada de la app'
);

select * from finish();
rollback;
