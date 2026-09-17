alter table public.smart_links
  add column destination_mode text not null default 'auto';

alter table public.smart_links
  add constraint smart_links_destination_mode
    check (destination_mode in ('auto', 'ios', 'android', 'web')),
  add constraint smart_links_name_length
    check (char_length(name) between 1 and 160),
  add constraint smart_links_tracking_lengths
    check (
      char_length(coalesce(utm_source, '')) <= 255
      and char_length(coalesce(utm_medium, '')) <= 255
      and char_length(coalesce(utm_campaign, '')) <= 255
      and char_length(coalesce(utm_content, '')) <= 255
      and char_length(coalesce(utm_term, '')) <= 255
      and char_length(coalesce(affiliate_id, '')) <= 255
      and char_length(coalesce(creator_id, '')) <= 255
      and char_length(coalesce(deep_link_path, '')) <= 1024
    ),
  add constraint smart_links_deep_link_path
    check (deep_link_path is null or deep_link_path ~ '^/[^[:space:]]*$'),
  add constraint smart_links_slug_not_reserved
    check (
      slug <> all (array[
        'admin', 'api', 'app', 'assetlinks', 'auth', 'dashboard', 'docs',
        'favicon', 'health', 'login', 'logout', 'null', 'onboarding',
        'privacy', 'r', 'robots', 'status', 'support', 'terms', 'undefined',
        'well-known', 'www'
      ]::text[])
    );

alter table public.link_destinations
  add constraint link_destinations_https
    check (destination_url ~ '^https://[^[:space:]]+$');

create unique index app_platforms_ios_bundle_per_organization
  on public.app_platforms (organization_id, lower(ios_bundle_id))
  where platform = 'ios' and ios_bundle_id is not null;

create unique index app_platforms_android_package_per_organization
  on public.app_platforms (organization_id, lower(android_package_name))
  where platform = 'android' and android_package_name is not null;

alter table public.link_clicks
  add column dedupe_key text not null default gen_random_uuid()::text,
  add column referrer_parameters jsonb not null default '{}'::jsonb,
  add column is_test boolean not null default false;

alter table public.link_clicks
  add constraint link_clicks_dedupe_key_length
    check (char_length(dedupe_key) between 16 and 128),
  add constraint link_clicks_referrer_object
    check (jsonb_typeof(referrer_parameters) = 'object'),
  add constraint link_clicks_platform_values
    check (
      platform_hint is null or platform_hint in ('ios', 'android', 'web')
    ),
  add constraint link_clicks_destination_values
    check (
      destination_platform is null
      or destination_platform in ('ios', 'android', 'web')
    );

create unique index link_clicks_app_dedupe_unique
  on public.link_clicks (app_id, dedupe_key);

create index link_clicks_link_platform_time_idx
  on public.link_clicks (smart_link_id, destination_platform, clicked_at desc)
  where not is_bot and not is_test;

create or replace function public.upsert_personal_app(payload jsonb)
returns table (app_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  workspace_organization_id uuid;
  workspace_app_id uuid;
  requested_app_id uuid;
  requested_name text := nullif(btrim(payload ->> 'name'), '');
  requested_platform text := lower(nullif(btrim(payload ->> 'platform'), ''));
  requested_ios_bundle_id text := nullif(btrim(payload ->> 'ios_bundle_id'), '');
  requested_android_package_name text := nullif(btrim(payload ->> 'android_package_name'), '');
  requested_currency text := upper(nullif(btrim(payload ->> 'currency'), ''));
  requested_timezone text := nullif(btrim(payload ->> 'timezone'), '');
  requested_status text := lower(coalesce(nullif(btrim(payload ->> 'status'), ''), 'active'));
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' or pg_column_size(payload) > 8192 then
    raise exception 'invalid_app_payload' using errcode = '22023';
  end if;

  if payload ? 'app_id' and nullif(payload ->> 'app_id', '') is not null then
    begin
      requested_app_id := (payload ->> 'app_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_app_id' using errcode = '22023';
    end;
  end if;

  if requested_name is null or char_length(requested_name) not between 2 and 120 then
    raise exception 'invalid_app_name' using errcode = '22023';
  end if;

  if requested_platform not in ('ios', 'android', 'both') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;

  if requested_currency is null or requested_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;

  if requested_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names timezone_name
    where timezone_name.name = requested_timezone
  ) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;

  if requested_status not in ('active', 'paused', 'disabled') then
    raise exception 'invalid_app_status' using errcode = '22023';
  end if;

  if requested_platform in ('ios', 'both') and (
    requested_ios_bundle_id is null
    or requested_ios_bundle_id !~ '^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$'
  ) then
    raise exception 'invalid_ios_bundle_id' using errcode = '22023';
  end if;

  if requested_platform in ('android', 'both') and (
    requested_android_package_name is null
    or requested_android_package_name !~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$'
  ) then
    raise exception 'invalid_android_package_name' using errcode = '22023';
  end if;

  select ensured.organization_id
    into workspace_organization_id
  from public.ensure_personal_workspace(null) ensured
  limit 1;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(workspace_organization_id::text || ':apps', 0)
  );

  if requested_app_id is null then
    workspace_app_id := gen_random_uuid();
    insert into public.apps (
      id, organization_id, name, slug, timezone, currency, status
    ) values (
      workspace_app_id,
      workspace_organization_id,
      requested_name,
      'app-' || left(replace(workspace_app_id::text, '-', ''), 12),
      requested_timezone,
      requested_currency,
      requested_status::public.record_status
    );
  else
    update public.apps app
    set name = requested_name,
        timezone = requested_timezone,
        currency = requested_currency,
        status = requested_status::public.record_status,
        updated_at = statement_timestamp()
    where app.id = requested_app_id
      and app.organization_id = workspace_organization_id
    returning app.id into workspace_app_id;

    if workspace_app_id is null then
      raise exception 'app_not_found' using errcode = 'P0002';
    end if;
  end if;

  if requested_platform in ('ios', 'both') then
    insert into public.app_platforms (
      organization_id, app_id, platform, ios_bundle_id, android_package_name
    ) values (
      workspace_organization_id, workspace_app_id, 'ios', requested_ios_bundle_id, null
    )
    on conflict (app_id, platform) do update
      set ios_bundle_id = excluded.ios_bundle_id,
          android_package_name = null,
          updated_at = statement_timestamp();
  end if;

  if requested_platform in ('android', 'both') then
    insert into public.app_platforms (
      organization_id, app_id, platform, ios_bundle_id, android_package_name
    ) values (
      workspace_organization_id, workspace_app_id, 'android', null, requested_android_package_name
    )
    on conflict (app_id, platform) do update
      set ios_bundle_id = null,
          android_package_name = excluded.android_package_name,
          updated_at = statement_timestamp();
  end if;

  delete from public.app_platforms app_platform
  where app_platform.organization_id = workspace_organization_id
    and app_platform.app_id = workspace_app_id
    and (
      (requested_platform = 'ios' and app_platform.platform = 'android')
      or (requested_platform = 'android' and app_platform.platform = 'ios')
    );

  insert into public.audit_log (
    organization_id, app_id, actor_user_id, actor_kind, action,
    target_table, target_id, after_state
  ) values (
    workspace_organization_id,
    workspace_app_id,
    caller_id,
    'user',
    case when requested_app_id is null then 'app.created' else 'app.updated' end,
    'apps',
    workspace_app_id,
    jsonb_build_object('platform', requested_platform, 'status', requested_status)
  );

  return query select workspace_app_id;
end;
$$;

create or replace function public.upsert_personal_smart_link(payload jsonb)
returns table (smart_link_id uuid, previous_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  workspace_organization_id uuid;
  requested_link_id uuid;
  requested_app_id uuid;
  workspace_link_id uuid;
  old_slug text;
  requested_name text := nullif(btrim(payload ->> 'name'), '');
  requested_slug text := lower(nullif(btrim(payload ->> 'slug'), ''));
  requested_status text := lower(coalesce(nullif(btrim(payload ->> 'status'), ''), 'active'));
  requested_source_kind text := lower(nullif(btrim(payload ->> 'source_kind'), ''));
  requested_destination_mode text := lower(coalesce(nullif(btrim(payload ->> 'destination_mode'), ''), 'auto'));
  requested_window integer := coalesce((payload ->> 'attribution_window_days')::integer, 7);
  requested_campaign_external_id text := nullif(btrim(payload ->> 'campaign_external_id'), '');
  requested_campaign_name text := nullif(btrim(payload ->> 'campaign_name'), '');
  requested_ad_group_external_id text := nullif(btrim(payload ->> 'ad_group_external_id'), '');
  requested_ad_group_name text := nullif(btrim(payload ->> 'ad_group_name'), '');
  requested_ad_external_id text := nullif(btrim(payload ->> 'ad_external_id'), '');
  requested_ad_name text := nullif(btrim(payload ->> 'ad_name'), '');
  requested_ios_url text := nullif(btrim(payload ->> 'ios_url'), '');
  requested_android_url text := nullif(btrim(payload ->> 'android_url'), '');
  requested_web_url text := nullif(btrim(payload ->> 'web_url'), '');
  workspace_source_id uuid;
  workspace_campaign_id uuid;
  workspace_ad_group_id uuid;
  workspace_ad_id uuid;
  source_display_name text;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' or pg_column_size(payload) > 32768 then
    raise exception 'invalid_smart_link_payload' using errcode = '22023';
  end if;

  begin
    requested_app_id := (payload ->> 'app_id')::uuid;
    if nullif(payload ->> 'smart_link_id', '') is not null then
      requested_link_id := (payload ->> 'smart_link_id')::uuid;
    end if;
  exception when invalid_text_representation then
    raise exception 'invalid_identifier' using errcode = '22023';
  end;

  if requested_app_id is null then
    raise exception 'app_required' using errcode = '22023';
  end if;

  if requested_name is null or char_length(requested_name) not between 2 and 160 then
    raise exception 'invalid_link_name' using errcode = '22023';
  end if;

  if requested_slug is null
    or requested_slug !~ '^[a-z0-9][a-z0-9-]{1,80}$'
    or requested_slug = any (array[
      'admin', 'api', 'app', 'assetlinks', 'auth', 'dashboard', 'docs',
      'favicon', 'health', 'login', 'logout', 'null', 'onboarding',
      'privacy', 'r', 'robots', 'status', 'support', 'terms', 'undefined',
      'well-known', 'www'
    ]::text[]) then
    raise exception 'invalid_or_reserved_slug' using errcode = '22023';
  end if;

  if requested_status not in ('active', 'paused', 'disabled') then
    raise exception 'invalid_link_status' using errcode = '22023';
  end if;

  if requested_source_kind not in (
    'google_ads', 'meta_ads', 'tiktok_ads', 'affiliate',
    'influencer', 'organic', 'other'
  ) then
    raise exception 'invalid_source_kind' using errcode = '22023';
  end if;

  if requested_destination_mode not in ('auto', 'ios', 'android', 'web') then
    raise exception 'invalid_destination_mode' using errcode = '22023';
  end if;

  if requested_window not between 1 and 90 then
    raise exception 'invalid_attribution_window' using errcode = '22023';
  end if;

  if requested_web_url is null or requested_web_url !~ '^https://[^[:space:]]+$' then
    raise exception 'invalid_web_destination' using errcode = '22023';
  end if;

  if requested_ios_url is not null and requested_ios_url !~ '^https://apps\.apple\.com/' then
    raise exception 'invalid_ios_destination' using errcode = '22023';
  end if;

  if requested_android_url is not null and requested_android_url !~ '^https://play\.google\.com/' then
    raise exception 'invalid_android_destination' using errcode = '22023';
  end if;

  if requested_destination_mode = 'ios' and requested_ios_url is null then
    raise exception 'ios_destination_required' using errcode = '22023';
  end if;

  if requested_destination_mode = 'android' and requested_android_url is null then
    raise exception 'android_destination_required' using errcode = '22023';
  end if;

  if requested_destination_mode = 'auto'
    and requested_ios_url is null
    and requested_android_url is null then
    raise exception 'mobile_destination_required' using errcode = '22023';
  end if;

  if char_length(coalesce(payload ->> 'deep_link_path', '')) > 1024
    or (
      nullif(btrim(payload ->> 'deep_link_path'), '') is not null
      and nullif(btrim(payload ->> 'deep_link_path'), '') !~ '^/[^[:space:]]*$'
    ) then
    raise exception 'invalid_deep_link_path' using errcode = '22023';
  end if;

  if greatest(
    char_length(coalesce(requested_campaign_external_id, '')),
    char_length(coalesce(requested_campaign_name, '')),
    char_length(coalesce(requested_ad_group_external_id, '')),
    char_length(coalesce(requested_ad_group_name, '')),
    char_length(coalesce(requested_ad_external_id, '')),
    char_length(coalesce(requested_ad_name, '')),
    char_length(coalesce(payload ->> 'utm_source', '')),
    char_length(coalesce(payload ->> 'utm_medium', '')),
    char_length(coalesce(payload ->> 'utm_campaign', '')),
    char_length(coalesce(payload ->> 'utm_content', '')),
    char_length(coalesce(payload ->> 'utm_term', '')),
    char_length(coalesce(payload ->> 'affiliate_id', '')),
    char_length(coalesce(payload ->> 'creator_id', ''))
  ) > 255 then
    raise exception 'tracking_value_too_long' using errcode = '22023';
  end if;

  if (requested_ad_group_name is not null or requested_ad_group_external_id is not null)
    and requested_campaign_name is null and requested_campaign_external_id is null then
    raise exception 'campaign_required_for_ad_group' using errcode = '22023';
  end if;

  if (requested_ad_name is not null or requested_ad_external_id is not null)
    and requested_ad_group_name is null and requested_ad_group_external_id is null then
    raise exception 'ad_group_required_for_ad' using errcode = '22023';
  end if;

  select ensured.organization_id
    into workspace_organization_id
  from public.ensure_personal_workspace(null) ensured
  limit 1;

  if not exists (
    select 1 from public.apps app
    where app.id = requested_app_id
      and app.organization_id = workspace_organization_id
      and app.status = 'active'
  ) then
    raise exception 'active_app_not_found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requested_app_id::text || ':smart-links', 0)
  );

  if exists (
    select 1 from public.smart_links smart_link
    where smart_link.slug = requested_slug
      and (requested_link_id is null or smart_link.id <> requested_link_id)
  ) then
    raise exception 'slug_already_used' using errcode = '23505';
  end if;

  source_display_name := case requested_source_kind
    when 'google_ads' then 'Google Ads'
    when 'meta_ads' then 'Meta Ads'
    when 'tiktok_ads' then 'TikTok Ads'
    when 'affiliate' then 'Afiliado'
    when 'influencer' then 'Influencer'
    when 'organic' then 'Orgánico'
    else 'Otro'
  end;

  insert into public.sources (
    organization_id, app_id, kind, name, status
  ) values (
    workspace_organization_id,
    requested_app_id,
    requested_source_kind::public.source_kind,
    source_display_name,
    'active'
  )
  on conflict (app_id, kind, name) do update
    set status = 'active', updated_at = statement_timestamp()
  returning id into workspace_source_id;

  if requested_campaign_name is not null or requested_campaign_external_id is not null then
    select campaign.id into workspace_campaign_id
    from public.campaigns campaign
    where campaign.app_id = requested_app_id
      and campaign.source_id = workspace_source_id
      and (
        (requested_campaign_external_id is not null and campaign.external_id = requested_campaign_external_id)
        or (
          requested_campaign_external_id is null
          and lower(campaign.name) = lower(requested_campaign_name)
        )
      )
    order by campaign.created_at
    limit 1;

    if workspace_campaign_id is null then
      insert into public.campaigns (
        organization_id, app_id, source_id, name, external_id
      ) values (
        workspace_organization_id,
        requested_app_id,
        workspace_source_id,
        coalesce(requested_campaign_name, requested_campaign_external_id),
        requested_campaign_external_id
      ) returning id into workspace_campaign_id;
    end if;
  end if;

  if requested_ad_group_name is not null or requested_ad_group_external_id is not null then
    select ad_group.id into workspace_ad_group_id
    from public.ad_groups ad_group
    where ad_group.app_id = requested_app_id
      and ad_group.campaign_id = workspace_campaign_id
      and (
        (requested_ad_group_external_id is not null and ad_group.external_id = requested_ad_group_external_id)
        or (
          requested_ad_group_external_id is null
          and lower(ad_group.name) = lower(requested_ad_group_name)
        )
      )
    order by ad_group.created_at
    limit 1;

    if workspace_ad_group_id is null then
      insert into public.ad_groups (
        organization_id, app_id, source_id, campaign_id, name, external_id
      ) values (
        workspace_organization_id,
        requested_app_id,
        workspace_source_id,
        workspace_campaign_id,
        coalesce(requested_ad_group_name, requested_ad_group_external_id),
        requested_ad_group_external_id
      ) returning id into workspace_ad_group_id;
    end if;
  end if;

  if requested_ad_name is not null or requested_ad_external_id is not null then
    select ad.id into workspace_ad_id
    from public.ads ad
    where ad.app_id = requested_app_id
      and ad.ad_group_id = workspace_ad_group_id
      and (
        (requested_ad_external_id is not null and ad.external_id = requested_ad_external_id)
        or (
          requested_ad_external_id is null
          and lower(ad.name) = lower(requested_ad_name)
        )
      )
    order by ad.created_at
    limit 1;

    if workspace_ad_id is null then
      insert into public.ads (
        organization_id, app_id, source_id, campaign_id, ad_group_id,
        name, external_id
      ) values (
        workspace_organization_id,
        requested_app_id,
        workspace_source_id,
        workspace_campaign_id,
        workspace_ad_group_id,
        coalesce(requested_ad_name, requested_ad_external_id),
        requested_ad_external_id
      ) returning id into workspace_ad_id;
    end if;
  end if;

  if requested_link_id is null then
    workspace_link_id := gen_random_uuid();
    insert into public.smart_links (
      id, organization_id, app_id, source_id, campaign_id, ad_group_id, ad_id,
      name, slug, status, attribution_window_days, destination_mode,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      affiliate_id, creator_id, deep_link_path
    ) values (
      workspace_link_id,
      workspace_organization_id,
      requested_app_id,
      workspace_source_id,
      workspace_campaign_id,
      workspace_ad_group_id,
      workspace_ad_id,
      requested_name,
      requested_slug,
      requested_status::public.record_status,
      requested_window,
      requested_destination_mode,
      nullif(btrim(payload ->> 'utm_source'), ''),
      nullif(btrim(payload ->> 'utm_medium'), ''),
      nullif(btrim(payload ->> 'utm_campaign'), ''),
      nullif(btrim(payload ->> 'utm_content'), ''),
      nullif(btrim(payload ->> 'utm_term'), ''),
      nullif(btrim(payload ->> 'affiliate_id'), ''),
      nullif(btrim(payload ->> 'creator_id'), ''),
      nullif(btrim(payload ->> 'deep_link_path'), '')
    );
  else
    select smart_link.slug into old_slug
    from public.smart_links smart_link
    where smart_link.id = requested_link_id
      and smart_link.organization_id = workspace_organization_id
      and smart_link.app_id = requested_app_id;

    if old_slug is null then
      raise exception 'smart_link_not_found' using errcode = 'P0002';
    end if;

    update public.smart_links smart_link
    set source_id = workspace_source_id,
        campaign_id = workspace_campaign_id,
        ad_group_id = workspace_ad_group_id,
        ad_id = workspace_ad_id,
        name = requested_name,
        slug = requested_slug,
        status = requested_status::public.record_status,
        attribution_window_days = requested_window,
        destination_mode = requested_destination_mode,
        utm_source = nullif(btrim(payload ->> 'utm_source'), ''),
        utm_medium = nullif(btrim(payload ->> 'utm_medium'), ''),
        utm_campaign = nullif(btrim(payload ->> 'utm_campaign'), ''),
        utm_content = nullif(btrim(payload ->> 'utm_content'), ''),
        utm_term = nullif(btrim(payload ->> 'utm_term'), ''),
        affiliate_id = nullif(btrim(payload ->> 'affiliate_id'), ''),
        creator_id = nullif(btrim(payload ->> 'creator_id'), ''),
        deep_link_path = nullif(btrim(payload ->> 'deep_link_path'), ''),
        updated_at = statement_timestamp()
    where smart_link.id = requested_link_id;
    workspace_link_id := requested_link_id;
  end if;

  delete from public.link_destinations destination
  where destination.smart_link_id = workspace_link_id;

  if requested_ios_url is not null then
    insert into public.link_destinations (
      organization_id, app_id, smart_link_id, platform, destination_url
    ) values (
      workspace_organization_id, requested_app_id, workspace_link_id, 'ios', requested_ios_url
    );
  end if;

  if requested_android_url is not null then
    insert into public.link_destinations (
      organization_id, app_id, smart_link_id, platform, destination_url
    ) values (
      workspace_organization_id, requested_app_id, workspace_link_id, 'android', requested_android_url
    );
  end if;

  insert into public.link_destinations (
    organization_id, app_id, smart_link_id, platform, destination_url
  ) values (
    workspace_organization_id, requested_app_id, workspace_link_id, 'web', requested_web_url
  );

  insert into public.audit_log (
    organization_id, app_id, actor_user_id, actor_kind, action,
    target_table, target_id, after_state
  ) values (
    workspace_organization_id,
    requested_app_id,
    caller_id,
    'user',
    case when requested_link_id is null then 'smart_link.created' else 'smart_link.updated' end,
    'smart_links',
    workspace_link_id,
    jsonb_build_object(
      'slug', requested_slug,
      'source_kind', requested_source_kind,
      'status', requested_status
    )
  );

  return query select workspace_link_id, old_slug;
end;
$$;

create or replace function public.set_personal_smart_link_status(
  requested_smart_link_id uuid,
  requested_status text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  workspace_organization_id uuid;
  link_slug text;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if requested_status not in ('active', 'paused', 'disabled') then
    raise exception 'invalid_link_status' using errcode = '22023';
  end if;

  select ensured.organization_id
    into workspace_organization_id
  from public.ensure_personal_workspace(null) ensured
  limit 1;

  update public.smart_links smart_link
  set status = requested_status::public.record_status,
      updated_at = statement_timestamp()
  where smart_link.id = requested_smart_link_id
    and smart_link.organization_id = workspace_organization_id
  returning smart_link.slug into link_slug;

  if link_slug is null then
    raise exception 'smart_link_not_found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action,
    target_table, target_id, after_state
  ) values (
    workspace_organization_id,
    caller_id,
    'user',
    'smart_link.status_changed',
    'smart_links',
    requested_smart_link_id,
    jsonb_build_object('status', requested_status)
  );

  return link_slug;
end;
$$;

create or replace function public.resolve_smart_link(requested_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'version', 1,
    'smartLinkId', smart_link.id,
    'organizationId', smart_link.organization_id,
    'appId', smart_link.app_id,
    'slug', smart_link.slug,
    'status', smart_link.status,
    'destinationMode', smart_link.destination_mode,
    'attributionWindowDays', smart_link.attribution_window_days,
    'deepLinkPath', smart_link.deep_link_path,
    'destinations', coalesce(
      jsonb_object_agg(destination.platform, destination.destination_url)
        filter (where destination.platform is not null),
      '{}'::jsonb
    ),
    'utm', jsonb_strip_nulls(jsonb_build_object(
      'utm_source', smart_link.utm_source,
      'utm_medium', smart_link.utm_medium,
      'utm_campaign', smart_link.utm_campaign,
      'utm_content', smart_link.utm_content,
      'utm_term', smart_link.utm_term
    )),
    'marketing', jsonb_strip_nulls(jsonb_build_object(
      'sourceKind', coalesce(source.kind::text, 'other'),
      'campaignId', campaign.external_id,
      'campaignName', campaign.name,
      'adGroupId', ad_group.external_id,
      'adGroupName', ad_group.name,
      'adId', ad.external_id,
      'adName', ad.name,
      'affiliateId', smart_link.affiliate_id,
      'creatorId', smart_link.creator_id
    ))
  )
  from public.smart_links smart_link
  join public.apps app
    on app.id = smart_link.app_id
   and app.organization_id = smart_link.organization_id
  left join public.sources source on source.id = smart_link.source_id
  left join public.campaigns campaign on campaign.id = smart_link.campaign_id
  left join public.ad_groups ad_group on ad_group.id = smart_link.ad_group_id
  left join public.ads ad on ad.id = smart_link.ad_id
  left join public.link_destinations destination
    on destination.smart_link_id = smart_link.id
   and destination.organization_id = smart_link.organization_id
   and destination.app_id = smart_link.app_id
  where smart_link.slug = lower(btrim(requested_slug))
    and smart_link.status = 'active'
    and app.status = 'active'
  group by
    smart_link.id,
    source.kind,
    campaign.external_id,
    campaign.name,
    ad_group.external_id,
    ad_group.name,
    ad.external_id,
    ad.name;
$$;

revoke all on function public.upsert_personal_app(jsonb)
  from public, anon, authenticated;
revoke all on function public.upsert_personal_smart_link(jsonb)
  from public, anon, authenticated;
revoke all on function public.set_personal_smart_link_status(uuid, text)
  from public, anon, authenticated;
revoke all on function public.resolve_smart_link(text)
  from public, anon, authenticated;

grant execute on function public.upsert_personal_app(jsonb)
  to authenticated;
grant execute on function public.upsert_personal_smart_link(jsonb)
  to authenticated;
grant execute on function public.set_personal_smart_link_status(uuid, text)
  to authenticated;
grant execute on function public.resolve_smart_link(text)
  to service_role;

comment on function public.upsert_personal_app(jsonb) is
  'Creates or updates one app and its platform identifiers atomically for the caller personal organization. It accepts no organization id.';
comment on function public.upsert_personal_smart_link(jsonb) is
  'Creates or updates the complete source hierarchy, smart link and destinations atomically for an authenticated owner.';
comment on function public.set_personal_smart_link_status(uuid, text) is
  'Changes a smart-link status only inside the caller personal organization.';
comment on function public.resolve_smart_link(text) is
  'Returns only the public redirect contract for an active link. Execution is restricted to the service role used by the links Worker.';
