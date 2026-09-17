alter table public.organizations
  add column is_personal boolean not null default false,
  add column onboarding_draft jsonb not null default '{}'::jsonb,
  add column onboarding_completed_at timestamptz;

alter table public.organizations
  add constraint organizations_onboarding_draft_object
  check (jsonb_typeof(onboarding_draft) = 'object');

create unique index organizations_one_personal_workspace_per_creator
  on public.organizations (created_by)
  where is_personal;

create or replace function public.ensure_personal_workspace(
  requested_display_name text default null
)
returns table (
  profile_id uuid,
  organization_id uuid,
  onboarding_complete boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_display_name text := nullif(btrim(requested_display_name), '');
  workspace_organization_id uuid;
  workspace_completed_at timestamptz;
  workspace_was_created boolean := false;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if normalized_display_name is not null
    and char_length(normalized_display_name) > 120 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text, 0)
  );

  insert into public.profiles (id, display_name)
  values (caller_id, normalized_display_name)
  on conflict (id) do update
    set display_name = coalesce(profiles.display_name, excluded.display_name),
        updated_at = statement_timestamp();

  select organization.id, organization.onboarding_completed_at
    into workspace_organization_id, workspace_completed_at
  from public.organizations organization
  where organization.created_by = caller_id
    and organization.is_personal
  order by organization.created_at
  limit 1;

  if workspace_organization_id is null then
    workspace_organization_id := gen_random_uuid();
    workspace_was_created := true;

    insert into public.organizations (
      id,
      name,
      slug,
      default_timezone,
      default_currency,
      created_by,
      is_personal
    )
    values (
      workspace_organization_id,
      coalesce(normalized_display_name || ' · Proyecto', 'Mi proyecto'),
      'personal-' || replace(caller_id::text, '-', ''),
      'UTC',
      'EUR',
      caller_id,
      true
    );
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (workspace_organization_id, caller_id, 'owner')
  on conflict (organization_id, user_id) do update
    set role = 'owner',
        updated_at = statement_timestamp();

  if workspace_was_created then
    insert into public.audit_log (
      organization_id,
      actor_user_id,
      actor_kind,
      action,
      target_table,
      target_id,
      after_state
    )
    values (
      workspace_organization_id,
      caller_id,
      'user',
      'personal_workspace.created',
      'organizations',
      workspace_organization_id,
      jsonb_build_object('is_personal', true)
    );
  end if;

  return query
  select
    caller_id,
    workspace_organization_id,
    workspace_completed_at is not null
      or exists (
        select 1
        from public.apps app
        where app.organization_id = workspace_organization_id
      );
end;
$$;

create or replace function public.save_personal_onboarding_draft(
  draft jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  workspace_organization_id uuid;
  unsupported_key text;
  requested_timezone text := nullif(btrim(draft ->> 'timezone'), '');
  requested_currency text := upper(nullif(btrim(draft ->> 'currency'), ''));
  requested_platform text := nullif(btrim(draft ->> 'platform'), '');
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if draft is null or jsonb_typeof(draft) <> 'object'
    or pg_column_size(draft) > 8192 then
    raise exception 'invalid_onboarding_draft' using errcode = '22023';
  end if;

  select draft_key.key into unsupported_key
  from jsonb_object_keys(draft) as draft_key(key)
  where draft_key.key <> all (array[
    'project_name', 'app_name', 'platform', 'ios_bundle_id',
    'android_package_name', 'currency', 'timezone'
  ]::text[])
  limit 1;

  if unsupported_key is not null then
    raise exception 'unsupported_onboarding_field' using errcode = '22023';
  end if;

  if char_length(coalesce(draft ->> 'project_name', '')) > 120
    or char_length(coalesce(draft ->> 'app_name', '')) > 120
    or char_length(coalesce(draft ->> 'ios_bundle_id', '')) > 255
    or char_length(coalesce(draft ->> 'android_package_name', '')) > 255 then
    raise exception 'onboarding_value_too_long' using errcode = '22023';
  end if;

  if requested_platform is not null
    and requested_platform not in ('ios', 'android', 'both') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;

  if requested_currency is not null
    and requested_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;

  if requested_timezone is not null
    and not exists (
      select 1 from pg_catalog.pg_timezone_names timezone_name
      where timezone_name.name = requested_timezone
    ) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;

  select ensured.organization_id
    into workspace_organization_id
  from public.ensure_personal_workspace(null) ensured
  limit 1;

  update public.organizations organization
  set onboarding_draft = draft,
      updated_at = statement_timestamp()
  where organization.id = workspace_organization_id;

  return draft;
end;
$$;

create or replace function public.complete_personal_onboarding(
  requested_project_name text,
  requested_app_name text,
  requested_platform text,
  requested_ios_bundle_id text,
  requested_android_package_name text,
  requested_currency text,
  requested_timezone text
)
returns table (
  organization_id uuid,
  app_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  workspace_organization_id uuid;
  workspace_app_id uuid;
  project_name text := nullif(btrim(requested_project_name), '');
  app_name text := nullif(btrim(requested_app_name), '');
  platform_choice text := lower(nullif(btrim(requested_platform), ''));
  ios_bundle_id text := nullif(btrim(requested_ios_bundle_id), '');
  android_package_name text := nullif(btrim(requested_android_package_name), '');
  currency_code text := upper(nullif(btrim(requested_currency), ''));
  timezone_name text := nullif(btrim(requested_timezone), '');
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if project_name is null or char_length(project_name) not between 2 and 120 then
    raise exception 'invalid_project_name' using errcode = '22023';
  end if;

  if app_name is null or char_length(app_name) not between 2 and 120 then
    raise exception 'invalid_app_name' using errcode = '22023';
  end if;

  if platform_choice not in ('ios', 'android', 'both') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;

  if currency_code is null or currency_code !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;

  if timezone_name is null
    or not exists (
      select 1 from pg_catalog.pg_timezone_names available_timezone
      where available_timezone.name = timezone_name
    ) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;

  if platform_choice in ('ios', 'both')
    and (
      ios_bundle_id is null
      or ios_bundle_id !~ '^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$'
    ) then
    raise exception 'invalid_ios_bundle_id' using errcode = '22023';
  end if;

  if platform_choice in ('android', 'both')
    and (
      android_package_name is null
      or android_package_name !~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$'
    ) then
    raise exception 'invalid_android_package_name' using errcode = '22023';
  end if;

  select ensured.organization_id
    into workspace_organization_id
  from public.ensure_personal_workspace(null) ensured
  limit 1;

  select app.id into workspace_app_id
  from public.apps app
  where app.organization_id = workspace_organization_id
  order by app.created_at
  limit 1;

  if workspace_app_id is null then
    workspace_app_id := gen_random_uuid();

    insert into public.apps (
      id,
      organization_id,
      name,
      slug,
      timezone,
      currency
    )
    values (
      workspace_app_id,
      workspace_organization_id,
      app_name,
      'app-' || left(replace(workspace_app_id::text, '-', ''), 12),
      timezone_name,
      currency_code
    );
  else
    update public.apps app
    set name = app_name,
        timezone = timezone_name,
        currency = currency_code,
        updated_at = statement_timestamp()
    where app.id = workspace_app_id
      and app.organization_id = workspace_organization_id;
  end if;

  if platform_choice in ('ios', 'both') then
    insert into public.app_platforms (
      organization_id,
      app_id,
      platform,
      ios_bundle_id,
      android_package_name
    )
    values (
      workspace_organization_id,
      workspace_app_id,
      'ios',
      ios_bundle_id,
      null
    )
    on conflict (app_id, platform) do update
      set ios_bundle_id = excluded.ios_bundle_id,
          android_package_name = null,
          updated_at = statement_timestamp();
  end if;

  if platform_choice in ('android', 'both') then
    insert into public.app_platforms (
      organization_id,
      app_id,
      platform,
      ios_bundle_id,
      android_package_name
    )
    values (
      workspace_organization_id,
      workspace_app_id,
      'android',
      null,
      android_package_name
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
      (platform_choice = 'ios' and app_platform.platform = 'android')
      or (platform_choice = 'android' and app_platform.platform = 'ios')
    );

  update public.organizations organization
  set name = project_name,
      default_timezone = timezone_name,
      default_currency = currency_code,
      onboarding_draft = '{}'::jsonb,
      onboarding_completed_at = coalesce(
        organization.onboarding_completed_at,
        statement_timestamp()
      ),
      updated_at = statement_timestamp()
  where organization.id = workspace_organization_id;

  insert into public.audit_log (
    organization_id,
    app_id,
    actor_user_id,
    actor_kind,
    action,
    target_table,
    target_id,
    after_state
  )
  values (
    workspace_organization_id,
    workspace_app_id,
    caller_id,
    'user',
    'onboarding.completed',
    'apps',
    workspace_app_id,
    jsonb_build_object(
      'platform', platform_choice,
      'currency', currency_code,
      'timezone', timezone_name
    )
  );

  return query select workspace_organization_id, workspace_app_id;
end;
$$;

revoke all on function public.ensure_personal_workspace(text)
  from public, anon, authenticated;
revoke all on function public.save_personal_onboarding_draft(jsonb)
  from public, anon, authenticated;
revoke all on function public.complete_personal_onboarding(
  text, text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.ensure_personal_workspace(text)
  to authenticated;
grant execute on function public.save_personal_onboarding_draft(jsonb)
  to authenticated;
grant execute on function public.complete_personal_onboarding(
  text, text, text, text, text, text, text
) to authenticated;

comment on function public.ensure_personal_workspace(text) is
  'Creates or repairs the caller personal workspace atomically. SECURITY DEFINER is limited to authenticated auth.uid(), uses an advisory transaction lock, accepts no tenant identifier and exposes no private data.';
comment on function public.save_personal_onboarding_draft(jsonb) is
  'Stores a bounded allow-listed onboarding draft for the caller personal workspace without accepting an organization identifier.';
comment on function public.complete_personal_onboarding(text, text, text, text, text, text, text) is
  'Completes the caller personal workspace and first app atomically after validating platform identifiers, currency and timezone.';
