alter type public.environment_kind add value if not exists 'staging';

alter table public.public_sdk_keys
  add column max_batch_events smallint not null default 100,
  add column max_request_bytes integer not null default 262144,
  add column allowed_sdk_prefixes text[] not null default array['react-native']::text[],
  add column allowed_platforms public.app_platform_kind[] not null
    default array['ios', 'android']::public.app_platform_kind[],
  add column attestation_mode text not null default 'optional',
  add column cache_ttl_seconds smallint not null default 60,
  add constraint public_sdk_keys_max_batch check (max_batch_events between 1 and 100),
  add constraint public_sdk_keys_max_body check (max_request_bytes between 1024 and 1048576),
  add constraint public_sdk_keys_sdk_prefixes check (cardinality(allowed_sdk_prefixes) between 1 and 10),
  add constraint public_sdk_keys_platforms check (cardinality(allowed_platforms) between 1 and 2),
  add constraint public_sdk_keys_attestation check (attestation_mode in ('off', 'optional', 'required')),
  add constraint public_sdk_keys_cache_ttl check (cache_ttl_seconds between 5 and 300);

alter table public.installations
  add column installation_access_token_hash bytea,
  add column attestation_status text not null default 'absent',
  add constraint installations_attestation_status
    check (attestation_status in ('absent', 'unverified', 'verified'));

alter table public.identities
  add column traits jsonb not null default '{}'::jsonb,
  add constraint identities_traits_object check (jsonb_typeof(traits) = 'object');

create or replace function public.resolve_ingest_app_key(provided_key_hash text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'keyId', sdk_key.id,
    'organizationId', sdk_key.organization_id,
    'appId', sdk_key.app_id,
    'environment', sdk_key.environment,
    'status', sdk_key.status,
    'appStatus', app.status,
    'maxBatchEvents', sdk_key.max_batch_events,
    'maxRequestBytes', sdk_key.max_request_bytes,
    'allowedSdkPrefixes', to_jsonb(sdk_key.allowed_sdk_prefixes),
    'allowedPlatforms', to_jsonb(sdk_key.allowed_platforms),
    'attestationMode', sdk_key.attestation_mode,
    'cacheTtlSeconds', sdk_key.cache_ttl_seconds
  )
  from public.public_sdk_keys sdk_key
  join public.apps app
    on app.id = sdk_key.app_id
   and app.organization_id = sdk_key.organization_id
  where provided_key_hash ~ '^[a-f0-9]{64}$'
    and pg_catalog.encode(sdk_key.key_hash, 'hex') = provided_key_hash
  limit 1;
$$;

create or replace function public.read_sdk_attribution(
  requested_app_id uuid,
  requested_installation_id uuid,
  provided_token_hash text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'method', attribution.method,
    'confidence', attribution.confidence,
    'attributedAt', attribution.attributed_at,
    'source', source.name,
    'campaign', campaign.name,
    'adGroup', ad_group.name,
    'ad', ad.name
  ))
  from public.installations installation
  join public.attributions attribution
    on attribution.installation_id = installation.id
   and attribution.organization_id = installation.organization_id
   and attribution.app_id = installation.app_id
   and attribution.is_current
  left join public.sources source on source.id = attribution.source_id
  left join public.campaigns campaign on campaign.id = attribution.campaign_id
  left join public.ad_groups ad_group on ad_group.id = attribution.ad_group_id
  left join public.ads ad on ad.id = attribution.ad_id
  where installation.app_id = requested_app_id
    and installation.id = requested_installation_id
    and provided_token_hash ~ '^[a-f0-9]{64}$'
    and installation.installation_access_token_hash is not null
    and pg_catalog.encode(installation.installation_access_token_hash, 'hex') = provided_token_hash
  limit 1;
$$;

create or replace function public.ingest_sdk_messages(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  persisted_installations integer := 0;
  persisted_identities integer := 0;
  persisted_events integer := 0;
  message_count integer;
begin
  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload -> 'messages') <> 'array'
    or pg_column_size(payload) > 16777216 then
    raise exception 'invalid_ingest_payload' using errcode = '22023';
  end if;

  message_count := jsonb_array_length(payload -> 'messages');
  if message_count < 1 or message_count > 50 then
    raise exception 'invalid_ingest_batch_size' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(payload -> 'messages') message(body)
    left join public.public_sdk_keys sdk_key
      on sdk_key.id = (message.body ->> 'keyId')::uuid
     and sdk_key.organization_id = (message.body ->> 'organizationId')::uuid
     and sdk_key.app_id = (message.body ->> 'appId')::uuid
     and sdk_key.environment::text = message.body ->> 'environment'
     and sdk_key.status = 'active'
    left join public.apps app
      on app.id = sdk_key.app_id
     and app.organization_id = sdk_key.organization_id
     and app.status = 'active'
    where sdk_key.id is null or app.id is null
  ) then
    raise exception 'invalid_ingest_scope' using errcode = '42501';
  end if;

  if exists (
    with installation_inputs as (
      select
        (message.body ->> 'organizationId')::uuid organization_id,
        (message.body ->> 'appId')::uuid app_id,
        case
          when message.body ->> 'kind' = 'events'
            then ((message.body -> 'body' -> 'events' -> 0) ->> 'installationId')::uuid
          else (message.body -> 'body' ->> 'installationId')::uuid
        end installation_id
      from jsonb_array_elements(payload -> 'messages') message(body)
    )
    select 1
    from installation_inputs input
    join public.installations installation on installation.id = input.installation_id
    where installation.organization_id <> input.organization_id
       or installation.app_id <> input.app_id
  ) then
    raise exception 'installation_scope_collision' using errcode = '23505';
  end if;

  with message_rows as (
    select message.body
    from jsonb_array_elements(payload -> 'messages') message(body)
  ), installation_inputs as (
    select
      (body ->> 'organizationId')::uuid organization_id,
      (body ->> 'appId')::uuid app_id,
      (body -> 'body' ->> 'installationId')::uuid installation_id,
      body -> 'body' ->> 'anonymousId' anonymous_id,
      (body -> 'body' ->> 'platform')::public.app_platform_kind platform,
      (body ->> 'environment')::public.environment_kind environment,
      (body -> 'body' ->> 'occurredAt')::timestamptz occurred_at,
      body -> 'body' ->> 'appVersion' app_version,
      body -> 'body' ->> 'sdkVersion' sdk_version,
      coalesce(body -> 'body' ->> 'consent', 'granted') consent_state,
      case when body ? 'accessTokenHash' then pg_catalog.decode(body ->> 'accessTokenHash', 'hex') end access_token_hash,
      body ->> 'attestation' attestation_status
    from message_rows
    where body ->> 'kind' in ('installation', 'identify')
    union all
    select
      (body ->> 'organizationId')::uuid,
      (body ->> 'appId')::uuid,
      (event.value ->> 'installationId')::uuid,
      event.value ->> 'anonymousId',
      (body -> 'body' ->> 'platform')::public.app_platform_kind,
      (body ->> 'environment')::public.environment_kind,
      (event.value ->> 'occurredAt')::timestamptz,
      null,
      body -> 'body' ->> 'sdkVersion',
      'granted',
      null,
      body ->> 'attestation'
    from message_rows
    cross join lateral jsonb_array_elements(body -> 'body' -> 'events') event(value)
    where body ->> 'kind' = 'events'
  ), installation_rollup as (
    select
      organization_id,
      app_id,
      installation_id,
      min(platform::text)::public.app_platform_kind platform,
      min(environment::text)::public.environment_kind environment,
      min(occurred_at) first_open_at,
      max(occurred_at) last_seen_at,
      max(app_version) app_version,
      max(sdk_version) sdk_version,
      max(consent_state) consent_state,
      (array_agg(access_token_hash) filter (where access_token_hash is not null))[1] access_token_hash,
      max(attestation_status) attestation_status
    from installation_inputs
    group by organization_id, app_id, installation_id
  )
  insert into public.installations (
    id, organization_id, app_id, installation_key_hash, platform, environment,
    first_open_at, last_seen_at, app_version, sdk_version, consent_state,
    installation_access_token_hash, attestation_status
  )
  select
    installation_id,
    organization_id,
    app_id,
    extensions.digest(installation_id::text, 'sha256'),
    platform,
    environment,
    first_open_at,
    last_seen_at,
    app_version,
    sdk_version,
    consent_state,
    access_token_hash,
    attestation_status
  from installation_rollup
  on conflict (id) do update
  set last_seen_at = greatest(public.installations.last_seen_at, excluded.last_seen_at),
      app_version = coalesce(excluded.app_version, public.installations.app_version),
      sdk_version = coalesce(excluded.sdk_version, public.installations.sdk_version),
      consent_state = excluded.consent_state,
      installation_access_token_hash = coalesce(
        excluded.installation_access_token_hash,
        public.installations.installation_access_token_hash
      ),
      attestation_status = case
        when excluded.attestation_status = 'verified' then 'verified'
        else public.installations.attestation_status
      end,
      updated_at = statement_timestamp()
  where public.installations.organization_id = excluded.organization_id
    and public.installations.app_id = excluded.app_id;
  get diagnostics persisted_installations = row_count;

  with message_rows as (
    select message.body
    from jsonb_array_elements(payload -> 'messages') message(body)
  ), identity_inputs as (
    select
      (body ->> 'organizationId')::uuid organization_id,
      (body ->> 'appId')::uuid app_id,
      (body -> 'body' ->> 'installationId')::uuid installation_id,
      'anonymous'::text identity_kind,
      body -> 'body' ->> 'anonymousId' identity_value,
      '{}'::jsonb traits,
      (body -> 'body' ->> 'occurredAt')::timestamptz valid_from
    from message_rows
    where body ->> 'kind' in ('installation', 'identify')
    union all
    select
      (body ->> 'organizationId')::uuid,
      (body ->> 'appId')::uuid,
      (event.value ->> 'installationId')::uuid,
      'anonymous',
      event.value ->> 'anonymousId',
      '{}'::jsonb,
      (event.value ->> 'occurredAt')::timestamptz
    from message_rows
    cross join lateral jsonb_array_elements(body -> 'body' -> 'events') event(value)
    where body ->> 'kind' = 'events'
    union all
    select
      (body ->> 'organizationId')::uuid,
      (body ->> 'appId')::uuid,
      (body -> 'body' ->> 'installationId')::uuid,
      'user',
      body -> 'body' ->> 'userId',
      coalesce(body -> 'body' -> 'traits', '{}'::jsonb),
      (body -> 'body' ->> 'occurredAt')::timestamptz
    from message_rows
    where body ->> 'kind' = 'identify'
    union all
    select
      (body ->> 'organizationId')::uuid,
      (body ->> 'appId')::uuid,
      ((body -> 'body' -> 'events' -> 0) ->> 'installationId')::uuid,
      'user',
      body -> 'body' -> 'identity' ->> 'userId',
      coalesce(body -> 'body' -> 'identity' -> 'traits', '{}'::jsonb),
      (body ->> 'receivedAt')::timestamptz
    from message_rows
    where body ->> 'kind' = 'events'
      and jsonb_typeof(body -> 'body' -> 'identity') = 'object'
  ), distinct_identities as (
    select distinct on (app_id, identity_kind, identity_value)
      organization_id, app_id, installation_id, identity_kind,
      identity_value, traits, valid_from
    from identity_inputs
    where identity_value is not null
    order by app_id, identity_kind, identity_value, valid_from desc
  )
  insert into public.identities (
    organization_id, app_id, installation_id, identity_kind,
    identity_hash, traits, valid_from
  )
  select
    organization_id,
    app_id,
    installation_id,
    identity_kind,
    extensions.digest(identity_value, 'sha256'),
    traits,
    valid_from
  from distinct_identities
  on conflict do nothing;
  get diagnostics persisted_identities = row_count;

  with message_rows as (
    select message.body
    from jsonb_array_elements(payload -> 'messages') message(body)
    where message.body ->> 'kind' = 'events'
  ), session_inputs as (
    select
      (body ->> 'organizationId')::uuid organization_id,
      (body ->> 'appId')::uuid app_id,
      (event.value ->> 'installationId')::uuid installation_id,
      (event.value ->> 'sessionId')::uuid session_id,
      min((event.value ->> 'occurredAt')::timestamptz) over (
        partition by body ->> 'appId', event.value ->> 'sessionId'
      ) started_at
    from message_rows
    cross join lateral jsonb_array_elements(body -> 'body' -> 'events') event(value)
  )
  insert into public.sessions (
    id, organization_id, app_id, installation_id, session_key, started_at
  )
  select distinct on (app_id, session_id)
    session_id, organization_id, app_id, installation_id, session_id::text, started_at
  from session_inputs
  order by app_id, session_id
  on conflict (id) do nothing;

  with message_rows as (
    select message.body
    from jsonb_array_elements(payload -> 'messages') message(body)
    where message.body ->> 'kind' = 'events'
  ), event_inputs as (
    select
      (body ->> 'organizationId')::uuid organization_id,
      (body ->> 'appId')::uuid app_id,
      (event.value ->> 'installationId')::uuid installation_id,
      (event.value ->> 'sessionId')::uuid session_id,
      (event.value ->> 'eventId')::uuid event_id,
      event.value ->> 'idempotencyKey' idempotency_key,
      event.value ->> 'name' name,
      (event.value ->> 'occurredAt')::timestamptz occurred_at,
      (body ->> 'receivedAt')::timestamptz received_at,
      event.value -> 'properties' properties
    from message_rows
    cross join lateral jsonb_array_elements(body -> 'body' -> 'events') event(value)
  ), inserted_events as (
    insert into public.events (
      id, organization_id, app_id, installation_id, session_id, event_id,
      idempotency_key, name, occurred_at, received_at, properties,
      value_minor, currency
    )
    select
      event_id,
      organization_id,
      app_id,
      installation_id,
      session_id,
      event_id,
      idempotency_key,
      name,
      occurred_at,
      received_at,
      properties,
      case
        when properties ->> 'valueMinor' ~ '^-?[0-9]+$'
         and properties ->> 'currency' ~ '^[A-Z]{3}$'
          then (properties ->> 'valueMinor')::bigint
      end,
      case
        when properties ->> 'valueMinor' ~ '^-?[0-9]+$'
         and properties ->> 'currency' ~ '^[A-Z]{3}$'
          then properties ->> 'currency'
      end
    from event_inputs
    on conflict do nothing
    returning *
  ), inserted_purchases as (
    insert into public.purchases (
      organization_id, app_id, installation_id, event_id, transaction_id,
      order_id, value_minor, currency, purchased_at
    )
    select
      organization_id,
      app_id,
      installation_id,
      id,
      properties ->> 'transactionId',
      properties ->> 'orderId',
      value_minor,
      currency,
      occurred_at
    from inserted_events
    where name = 'purchase'
    on conflict do nothing
    returning id
  ), active_subscription_rollup as (
    select
      organization_id,
      app_id,
      installation_id,
      properties ->> 'subscriptionId' subscription_id,
      max(properties ->> 'productId') product_id,
      min(occurred_at) period_started_at,
      sum(value_minor) revenue_minor,
      max(currency) currency
    from inserted_events
    where name in ('subscription_started', 'subscription_renewed')
    group by organization_id, app_id, installation_id, properties ->> 'subscriptionId'
  ), upserted_subscriptions as (
    insert into public.subscriptions (
      organization_id, app_id, installation_id, external_subscription_id,
      product_id, platform, status, current_period_started_at,
      revenue_minor, currency
    )
    select
      rollup.organization_id,
      rollup.app_id,
      rollup.installation_id,
      rollup.subscription_id,
      rollup.product_id,
      installation.platform,
      'active',
      rollup.period_started_at,
      rollup.revenue_minor,
      rollup.currency
    from active_subscription_rollup rollup
    join public.installations installation
      on installation.id = rollup.installation_id
     and installation.organization_id = rollup.organization_id
     and installation.app_id = rollup.app_id
    on conflict (app_id, external_subscription_id) do update
    set status = 'active',
        product_id = excluded.product_id,
        revenue_minor = public.subscriptions.revenue_minor + excluded.revenue_minor,
        currency = excluded.currency,
        updated_at = statement_timestamp()
    returning id
  ), latest_cancellations as (
    select distinct on (app_id, properties ->> 'subscriptionId')
      app_id,
      properties ->> 'subscriptionId' subscription_id,
      occurred_at
    from inserted_events
    where name = 'subscription_cancelled'
    order by app_id, properties ->> 'subscriptionId', occurred_at desc
  ), cancelled_subscriptions as (
    update public.subscriptions subscription
    set status = 'cancelled',
        cancelled_at = cancellation.occurred_at,
        updated_at = statement_timestamp()
    from latest_cancellations cancellation
    where subscription.app_id = cancellation.app_id
      and subscription.external_subscription_id = cancellation.subscription_id
    returning subscription.id
  )
  select count(*)::integer into persisted_events from inserted_events;

  with touched_sessions as (
    select distinct
      (message.body ->> 'appId')::uuid app_id,
      (event.value ->> 'sessionId')::uuid session_id
    from jsonb_array_elements(payload -> 'messages') message(body)
    cross join lateral jsonb_array_elements(message.body -> 'body' -> 'events') event(value)
    where message.body ->> 'kind' = 'events'
  )
  update public.sessions session
  set event_count = (
        select count(*)::integer
        from public.events event
        where event.app_id = session.app_id and event.session_id = session.id
      ),
      updated_at = statement_timestamp()
  from touched_sessions touched
  where session.app_id = touched.app_id and session.id = touched.session_id;

  with message_rows as (
    select message.body
    from jsonb_array_elements(payload -> 'messages') message(body)
  ), attribution_inputs as (
    select
      (body ->> 'organizationId')::uuid organization_id,
      (body ->> 'appId')::uuid app_id,
      (body -> 'body' ->> 'installationId')::uuid installation_id,
      body -> 'body' -> 'attribution' attribution,
      body ->> 'requestId' request_id
    from message_rows
    where body ->> 'kind' = 'installation'
      and jsonb_typeof(body -> 'body' -> 'attribution') = 'object'
    union all
    select
      (body ->> 'organizationId')::uuid,
      (body ->> 'appId')::uuid,
      ((body -> 'body' -> 'events' -> 0) ->> 'installationId')::uuid,
      body -> 'body' -> 'attribution',
      body ->> 'requestId'
    from message_rows
    where body ->> 'kind' = 'events'
      and jsonb_typeof(body -> 'body' -> 'attribution') = 'object'
  ), resolved_clicks as (
    select
      input.*,
      click.id click_id,
      smart_link.source_id,
      smart_link.campaign_id,
      smart_link.ad_group_id,
      smart_link.ad_id
    from attribution_inputs input
    join public.link_clicks click
      on click.id = case
        when input.attribution ->> 'clickId' ~ '^[0-9a-fA-F-]{36}$'
          then (input.attribution ->> 'clickId')::uuid
      end
     and click.organization_id = input.organization_id
     and click.app_id = input.app_id
    join public.smart_links smart_link
      on smart_link.id = click.smart_link_id
     and smart_link.organization_id = click.organization_id
     and smart_link.app_id = click.app_id
  )
  insert into public.attribution_candidates (
    organization_id, app_id, installation_id, click_id, source_id,
    campaign_id, ad_group_id, ad_id, candidate_key, method,
    confidence, score, evidence, rule_version, observed_at
  )
  select
    organization_id,
    app_id,
    installation_id,
    click_id,
    source_id,
    campaign_id,
    ad_group_id,
    ad_id,
    'sdk-click:' || click_id::text,
    (attribution ->> 'method')::public.attribution_method,
    1,
    1000,
    jsonb_build_object('requestId', request_id, 'clickId', click_id),
    'sdk-v1',
    (attribution ->> 'capturedAt')::timestamptz
  from resolved_clicks
  on conflict (app_id, installation_id, candidate_key, rule_version) do update
  set evidence = excluded.evidence,
      observed_at = least(public.attribution_candidates.observed_at, excluded.observed_at);

  insert into public.attributions (
    organization_id, app_id, installation_id, winning_candidate_id, click_id,
    source_id, campaign_id, ad_group_id, ad_id, method, confidence,
    evidence_summary, attribution_window_days, rule_version, attributed_at, is_current
  )
  select
    candidate.organization_id,
    candidate.app_id,
    candidate.installation_id,
    candidate.id,
    candidate.click_id,
    candidate.source_id,
    candidate.campaign_id,
    candidate.ad_group_id,
    candidate.ad_id,
    candidate.method,
    candidate.confidence,
    candidate.evidence,
    smart_link.attribution_window_days,
    candidate.rule_version,
    candidate.observed_at,
    true
  from public.attribution_candidates candidate
  join public.link_clicks click on click.id = candidate.click_id
  join public.smart_links smart_link on smart_link.id = click.smart_link_id
  where candidate.rule_version = 'sdk-v1'
    and exists (
      select 1
      from jsonb_array_elements(payload -> 'messages') message(body)
      where (message.body ->> 'appId')::uuid = candidate.app_id
        and (
          (message.body -> 'body' ->> 'installationId')::uuid = candidate.installation_id
          or ((message.body -> 'body' -> 'events' -> 0) ->> 'installationId')::uuid = candidate.installation_id
        )
    )
  on conflict (app_id, installation_id) where is_current do update
  set winning_candidate_id = excluded.winning_candidate_id,
      click_id = excluded.click_id,
      source_id = excluded.source_id,
      campaign_id = excluded.campaign_id,
      ad_group_id = excluded.ad_group_id,
      ad_id = excluded.ad_id,
      method = excluded.method,
      confidence = excluded.confidence,
      evidence_summary = excluded.evidence_summary,
      attribution_window_days = excluded.attribution_window_days,
      rule_version = excluded.rule_version,
      attributed_at = excluded.attributed_at,
      updated_at = statement_timestamp();

  return jsonb_build_object(
    'messages', message_count,
    'installations', persisted_installations,
    'identities', persisted_identities,
    'events', persisted_events
  );
end;
$$;

revoke all on function public.resolve_ingest_app_key(text) from public, anon, authenticated;
revoke all on function public.read_sdk_attribution(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.ingest_sdk_messages(jsonb) from public, anon, authenticated;

grant execute on function public.resolve_ingest_app_key(text) to service_role;
grant execute on function public.read_sdk_attribution(uuid, uuid, text) to service_role;
grant execute on function public.ingest_sdk_messages(jsonb) to service_role;

comment on function public.resolve_ingest_app_key(text) is
  'Resolves a hashed public SDK key to its bounded ingest configuration. Restricted to service_role.';
comment on function public.read_sdk_attribution(uuid, uuid, text) is
  'Returns one installation attribution only when both app scope and installation proof token match.';
comment on function public.ingest_sdk_messages(jsonb) is
  'Persists one Cloudflare Queue batch idempotently. The caller must be the ingest service_role.';
