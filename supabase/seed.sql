-- Datos exclusivamente ficticios para desarrollo local.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000101',
  'authenticated',
  'authenticated',
  'demo-owner@attruvi.invalid',
  extensions.crypt('demo-password-not-for-production', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Propietaria Demo"}'::jsonb,
  now(), now(), '', '', ''
)
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values ('00000000-0000-4000-8000-000000000101', 'Propietaria Demo')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug, default_timezone, default_currency, created_by)
values (
  '10000000-0000-4000-8000-000000000001', 'Demo', 'demo', 'Europe/Madrid', 'EUR',
  '00000000-0000-4000-8000-000000000101'
)
on conflict (id) do nothing;

insert into public.organization_members (id, organization_id, user_id, role)
values (
  '11000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  'owner'
)
on conflict (organization_id, user_id) do nothing;

insert into public.apps (id, organization_id, name, slug, timezone, currency)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Attruvi React Native Demo', 'react-native-demo', 'Europe/Madrid', 'EUR'
)
on conflict (id) do nothing;

insert into public.app_platforms (
  id, organization_id, app_id, platform, ios_bundle_id, android_package_name, store_url
)
values
  (
    '21000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'ios', 'com.example.attruvi.demo', null, 'https://apps.apple.com/app/id000000000'
  ),
  (
    '21000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'android', null, 'com.example.attruvi.demo', 'https://play.google.com/store/apps/details?id=com.example.attruvi.demo'
  )
on conflict (id) do nothing;

insert into public.public_sdk_keys (
  id, organization_id, app_id, key_hash, visible_prefix, environment, status, created_by
)
values (
  '22000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  extensions.digest('attruvi_demo_public_key_only', 'sha256'),
  'attruvi_demo', 'development', 'active',
  '00000000-0000-4000-8000-000000000101'
)
on conflict (id) do nothing;

insert into public.sources (id, organization_id, app_id, kind, name, external_id)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'google_ads', 'Google Ads', 'demo-google'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'meta_ads', 'Meta Ads', 'demo-meta'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'tiktok_ads', 'TikTok Ads', 'demo-tiktok'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'affiliate', 'Afiliado Demo', 'demo-affiliate'),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'influencer', 'Creadora Demo', 'demo-creator'),
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'organic', 'Orgánico', null)
on conflict (id) do nothing;

insert into public.campaigns (id, organization_id, app_id, source_id, name, external_id)
values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Búsqueda otoño', 'g-campaign-01'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Vídeo instalaciones', 'm-campaign-01'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'UGC septiembre', 't-campaign-01'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'Partners', 'affiliate-campaign-01'),
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', 'Lanzamiento creadora', 'creator-campaign-01'),
  ('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', 'Descubrimiento natural', null)
on conflict (id) do nothing;

insert into public.ad_groups (id, organization_id, app_id, source_id, campaign_id, name, external_id)
select
  ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Grupo demo ' || n,
  case when n = 6 then null else 'group-' || n end
from generate_series(1, 6) as series(n)
on conflict (id) do nothing;

insert into public.ads (id, organization_id, app_id, source_id, campaign_id, ad_group_id, name, external_id)
select
  ('60000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Anuncio demo ' || n,
  case when n = 6 then null else 'ad-' || n end
from generate_series(1, 6) as series(n)
on conflict (id) do nothing;

insert into public.smart_links (
  id, organization_id, app_id, source_id, campaign_id, ad_group_id, ad_id,
  name, slug, utm_source, utm_medium, utm_campaign, utm_content
)
select
  ('70000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('60000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Enlace demo ' || n,
  'demo-' || n,
  case n when 1 then 'google' when 2 then 'meta' when 3 then 'tiktok' when 4 then 'affiliate' when 5 then 'creator' else 'organic' end,
  case when n <= 3 then 'paid_social' else 'referral' end,
  'campaign-' || n,
  'ad-' || n
from generate_series(1, 6) as series(n)
on conflict (id) do nothing;

insert into public.link_destinations (
  id, organization_id, app_id, smart_link_id, platform, destination_url
)
select
  ('71000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  ('70000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'android',
  'https://play.google.com/store/apps/details?id=com.example.attruvi.demo'
from generate_series(1, 6) as series(n)
on conflict (id) do nothing;

insert into public.link_clicks (
  id, organization_id, app_id, smart_link_id, request_id, clicked_at,
  platform_hint, destination_platform, utm_parameters
)
select
  ('80000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  ('70000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('81000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '2026-09-10T08:00:00Z'::timestamptz + make_interval(hours => n),
  'android', 'android', jsonb_build_object('utm_campaign', 'campaign-' || n)
from generate_series(1, 5) as series(n)
on conflict (id) do nothing;

insert into public.installations (
  id, organization_id, app_id, installation_key_hash, platform, environment,
  first_open_at, last_seen_at, app_version, sdk_version, consent_state
)
select
  ('90000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  extensions.digest('demo-installation-' || n, 'sha256'),
  'android'::public.app_platform_kind, 'development'::public.environment_kind,
  '2026-09-10T09:00:00Z'::timestamptz + make_interval(hours => n),
  '2026-09-16T09:00:00Z'::timestamptz + make_interval(hours => n),
  '1.0.0', '0.1.0', 'granted'
from generate_series(1, 5) as series(n)
on conflict (id) do nothing;

insert into public.attributions (
  id, organization_id, app_id, installation_id, click_id, source_id, campaign_id,
  ad_group_id, ad_id, method, confidence, evidence_summary,
  attribution_window_days, rule_version, attributed_at
)
select
  ('92000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  ('90000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('80000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('60000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'direct_link', 1.0000, '{"signal":"demo_click_id"}'::jsonb,
  7, 'demo-v1', '2026-09-10T09:00:00Z'::timestamptz + make_interval(hours => n)
from generate_series(1, 5) as series(n)
on conflict (id) do nothing;

insert into public.sessions (
  id, organization_id, app_id, installation_id, session_key, started_at, ended_at, event_count
)
select
  ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  ('90000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'demo-session-' || n,
  '2026-09-10T09:05:00Z'::timestamptz + make_interval(hours => n),
  '2026-09-10T09:25:00Z'::timestamptz + make_interval(hours => n),
  case when n <= 3 then 2 else 1 end
from generate_series(1, 5) as series(n)
on conflict (id) do nothing;

insert into public.events (
  id, organization_id, app_id, installation_id, session_id, event_id,
  idempotency_key, name, occurred_at, properties, value_minor, currency
)
select
  ('b0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  ('90000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('b1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'demo-install-' || n, 'install',
  '2026-09-10T09:00:00Z'::timestamptz + make_interval(hours => n),
  '{"platform":"android","sdk_version":"0.1.0"}'::jsonb,
  null, null
from generate_series(1, 5) as series(n)
on conflict (app_id, event_id) do nothing;

insert into public.events (
  id, organization_id, app_id, installation_id, session_id, event_id,
  idempotency_key, name, occurred_at, properties, value_minor, currency
)
select
  ('b2000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  ('90000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('b3000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'demo-purchase-' || n, 'purchase',
  '2026-09-10T09:20:00Z'::timestamptz + make_interval(hours => n),
  jsonb_build_object('transaction_id', 'demo-transaction-' || n),
  case n when 1 then 4990 when 2 then 2990 else 9990 end,
  'EUR'
from generate_series(1, 3) as series(n)
on conflict (app_id, event_id) do nothing;

insert into public.purchases (
  id, organization_id, app_id, installation_id, event_id, transaction_id,
  order_id, value_minor, currency, status, purchased_at
)
select
  ('c0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  ('90000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('b2000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'demo-transaction-' || n,
  'demo-order-' || n,
  case n when 1 then 4990 when 2 then 2990 else 9990 end,
  'EUR', 'verified',
  '2026-09-10T09:20:00Z'::timestamptz + make_interval(hours => n)
from generate_series(1, 3) as series(n)
on conflict (id) do nothing;

insert into public.ad_costs (
  id, organization_id, app_id, source_id, campaign_id, ad_group_id, ad_id,
  cost_date, amount_minor, currency, impressions, clicks, external_row_id
)
select
  ('d0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('60000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '2026-09-10'::date,
  case n when 1 then 3200 when 2 then 2500 when 3 then 1800 when 4 then 900 when 5 then 1200 else 0 end,
  'EUR', 10000 * n, 100 * n, 'demo-cost-' || n
from generate_series(1, 6) as series(n)
on conflict do nothing;

insert into public.daily_metrics (
  id, organization_id, app_id, metric_date, source_id, campaign_id, ad_group_id,
  ad_id, currency, spend_minor, revenue_minor, clicks, installs,
  registered_users, buyers, purchases, sessions, retained_d1, retained_d7,
  retained_d30, metric_version
)
select
  ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  '2026-09-10'::date,
  ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('60000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'EUR',
  case n when 1 then 3200 when 2 then 2500 when 3 then 1800 when 4 then 900 when 5 then 1200 else 0 end,
  case n when 1 then 4990 when 2 then 2990 when 3 then 9990 else 0 end,
  100 * n, case when n <= 5 then 1 else 0 end,
  case when n <= 4 then 1 else 0 end,
  case when n <= 3 then 1 else 0 end,
  case when n <= 3 then 1 else 0 end,
  case when n <= 5 then 2 else 0 end,
  case when n <= 4 then 1 else 0 end,
  case when n <= 3 then 1 else 0 end,
  0, 'demo-v1'
from generate_series(1, 6) as series(n)
on conflict do nothing;
