-- Security and privacy hardening. This migration deliberately keeps aggregate facts
-- while removing direct/persistent identifiers after their configured lifetime.

alter table public.installations
  add column consent_analytics boolean not null default true,
  add column consent_attribution boolean not null default true,
  add column consent_advertising boolean not null default false,
  add column consent_personalization boolean not null default false,
  add column consent_version text not null default 'legacy-v1',
  add column consent_updated_at timestamptz not null default statement_timestamp(),
  add column privacy_anonymized_at timestamptz,
  add constraint installations_advertising_requires_attribution
    check (not consent_advertising or consent_attribution);

alter table public.link_clicks add column privacy_anonymized_at timestamptz;
alter table public.events add column privacy_anonymized_at timestamptz;
alter table public.postback_jobs add column privacy_anonymized_at timestamptz;
alter table public.postback_attempts add column privacy_anonymized_at timestamptz;

create table public.app_privacy_settings (
  app_id uuid primary key,
  organization_id uuid not null,
  raw_click_retention_days smallint not null default 90,
  event_properties_retention_days smallint not null default 400,
  debug_retention_days smallint not null default 7,
  postback_detail_retention_days smallint not null default 90,
  audit_retention_days smallint not null default 730,
  allow_probabilistic_attribution boolean not null default false,
  default_analytics_purpose boolean not null default true,
  default_attribution_purpose boolean not null default true,
  default_advertising_purpose boolean not null default false,
  default_personalization_purpose boolean not null default false,
  legal_basis_note text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint app_privacy_settings_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint app_privacy_settings_retention_ranges check (
    raw_click_retention_days between 1 and 3650
    and event_properties_retention_days between 1 and 3650
    and debug_retention_days between 1 and 90
    and postback_detail_retention_days between 1 and 730
    and audit_retention_days between 30 and 3650
  ),
  constraint app_privacy_settings_advertising_requires_attribution
    check (not default_advertising_purpose or default_attribution_purpose),
  constraint app_privacy_settings_legal_note_length
    check (legal_basis_note is null or char_length(legal_basis_note) <= 500)
);

insert into public.app_privacy_settings (app_id, organization_id)
select id, organization_id from public.apps
on conflict (app_id) do nothing;

create or replace function private.create_default_app_privacy_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_privacy_settings (app_id, organization_id)
  values (new.id, new.organization_id)
  on conflict (app_id) do nothing;
  return new;
end;
$$;

create trigger apps_create_privacy_settings
after insert on public.apps
for each row execute function private.create_default_app_privacy_settings();

create trigger app_privacy_settings_set_updated_at
before update on public.app_privacy_settings
for each row execute function private.set_updated_at();

alter table public.app_privacy_settings enable row level security;
revoke all on public.app_privacy_settings from public, anon, authenticated;
grant select, insert, update on public.app_privacy_settings to authenticated;
grant all on public.app_privacy_settings to service_role;

create policy app_privacy_settings_member_read on public.app_privacy_settings
for select to authenticated
using ((select private.is_organization_member(organization_id)));

create policy app_privacy_settings_admin_insert on public.app_privacy_settings
for insert to authenticated
with check ((select private.has_organization_role(
  organization_id, array['owner', 'admin']::public.organization_role[]
)));

create policy app_privacy_settings_admin_update on public.app_privacy_settings
for update to authenticated
using ((select private.has_organization_role(
  organization_id, array['owner', 'admin']::public.organization_role[]
)))
with check ((select private.has_organization_role(
  organization_id, array['owner', 'admin']::public.organization_role[]
)));

create table private.connector_oauth_states (
  state_hash bytea primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  app_id uuid not null,
  provider text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint connector_oauth_states_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint connector_oauth_states_provider check (provider in ('google_ads', 'meta_ads', 'tiktok_ads'))
);

create index connector_oauth_states_expiry_idx
on private.connector_oauth_states (expires_at)
where consumed_at is null;

revoke all on private.connector_oauth_states from public, anon, authenticated;

create or replace function public.issue_connector_oauth_state(
  requested_app_id uuid,
  requested_provider text,
  requested_state_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_organization_id uuid;
begin
  select organization_id into strict requested_organization_id
  from public.apps where id = requested_app_id;
  if not (select private.has_organization_role(
    requested_organization_id, array['owner', 'admin']::public.organization_role[]
  )) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if requested_provider not in ('google_ads', 'meta_ads', 'tiktok_ads')
    or requested_state_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid oauth state' using errcode = '22023';
  end if;
  delete from private.connector_oauth_states
  where user_id = (select auth.uid()) and (expires_at <= statement_timestamp() or consumed_at is not null);
  insert into private.connector_oauth_states (
    state_hash, user_id, organization_id, app_id, provider, expires_at
  ) values (
    pg_catalog.decode(requested_state_hash, 'hex'), (select auth.uid()),
    requested_organization_id, requested_app_id, requested_provider,
    statement_timestamp() + interval '10 minutes'
  );
end;
$$;

create or replace function public.consume_connector_oauth_state(
  requested_app_id uuid,
  requested_provider text,
  requested_state_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  consumed_count integer;
begin
  if requested_state_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  update private.connector_oauth_states
  set consumed_at = statement_timestamp()
  where state_hash = pg_catalog.decode(requested_state_hash, 'hex')
    and user_id = (select auth.uid())
    and app_id = requested_app_id
    and provider = requested_provider
    and consumed_at is null
    and expires_at > statement_timestamp();
  get diagnostics consumed_count = row_count;
  return consumed_count = 1;
end;
$$;

revoke all on function public.issue_connector_oauth_state(uuid, text, text) from public, anon;
revoke all on function public.consume_connector_oauth_state(uuid, text, text) from public, anon;
grant execute on function public.issue_connector_oauth_state(uuid, text, text) to authenticated;
grant execute on function public.consume_connector_oauth_state(uuid, text, text) to authenticated;

create or replace function public.record_connector_secret_rotation(
  requested_connector_account_id uuid,
  requested_from_version text,
  requested_to_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare account public.connector_accounts%rowtype;
begin
  select * into strict account from public.connector_accounts where id = requested_connector_account_id;
  insert into public.audit_log (
    organization_id, app_id, actor_kind, action, target_table, target_id, before_state, after_state
  ) values (
    account.organization_id, account.app_id, 'system', 'connector_secret.rotated',
    'connector_accounts', account.id,
    jsonb_build_object('keyVersion', requested_from_version),
    jsonb_build_object('keyVersion', requested_to_version)
  );
end;
$$;

create or replace function public.revoke_connector_secret(requested_connector_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare account public.connector_accounts%rowtype;
begin
  select * into strict account from public.connector_accounts where id = requested_connector_account_id;
  delete from private.connector_secrets where connector_account_id = requested_connector_account_id;
  update public.connector_accounts
  set secret_reference = null, status = 'disabled', connection_state = 'disabled', updated_at = statement_timestamp()
  where id = requested_connector_account_id;
  insert into public.audit_log (
    organization_id, app_id, actor_kind, action, target_table, target_id, after_state
  ) values (
    account.organization_id, account.app_id, 'system', 'connector_secret.revoked',
    'connector_accounts', account.id, jsonb_build_object('status', 'disabled')
  );
end;
$$;

revoke all on function public.record_connector_secret_rotation(uuid, text, text) from public, anon, authenticated;
revoke all on function public.revoke_connector_secret(uuid) from public, anon, authenticated;
grant execute on function public.record_connector_secret_rotation(uuid, text, text) to service_role;
grant execute on function public.revoke_connector_secret(uuid) to service_role;

create or replace function private.audit_administrative_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  organization_value uuid := coalesce((new_row ->> 'organization_id')::uuid, (old_row ->> 'organization_id')::uuid);
  app_value uuid := coalesce((new_row ->> 'app_id')::uuid, (old_row ->> 'app_id')::uuid);
  target_value uuid := coalesce((new_row ->> 'id')::uuid, (old_row ->> 'id')::uuid, app_value);
begin
  if (select auth.uid()) is null then return coalesce(new, old); end if;
  insert into public.audit_log (
    organization_id, app_id, actor_user_id, actor_kind, action, target_table, target_id,
    before_state, after_state
  ) values (
    organization_value,
    case when tg_table_name = 'apps' then null else app_value end,
    (select auth.uid()), 'user', lower(tg_table_name || '.' || tg_op), tg_table_name, target_value,
    case when old_row is null then null else jsonb_build_object('status', old_row -> 'status') end,
    case when new_row is null then null else jsonb_build_object('status', new_row -> 'status') end
  );
  return coalesce(new, old);
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'apps', 'public_sdk_keys', 'smart_links', 'connector_accounts',
    'postback_destinations', 'app_privacy_settings'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_administrative_change()',
      table_name || '_audit_admin_change', table_name
    );
  end loop;
end;
$$;

create or replace function public.update_app_privacy_settings(
  requested_app_id uuid,
  requested_raw_click_retention_days smallint,
  requested_event_properties_retention_days smallint,
  requested_debug_retention_days smallint,
  requested_postback_detail_retention_days smallint,
  requested_audit_retention_days smallint,
  requested_allow_probabilistic_attribution boolean,
  requested_legal_basis_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare requested_organization_id uuid;
begin
  select organization_id into strict requested_organization_id from public.apps where id = requested_app_id;
  if not (select private.has_organization_role(
    requested_organization_id, array['owner', 'admin']::public.organization_role[]
  )) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.app_privacy_settings set
    raw_click_retention_days = requested_raw_click_retention_days,
    event_properties_retention_days = requested_event_properties_retention_days,
    debug_retention_days = requested_debug_retention_days,
    postback_detail_retention_days = requested_postback_detail_retention_days,
    audit_retention_days = requested_audit_retention_days,
    allow_probabilistic_attribution = requested_allow_probabilistic_attribution,
    legal_basis_note = nullif(trim(requested_legal_basis_note), ''),
    updated_at = statement_timestamp()
  where app_id = requested_app_id;
end;
$$;

revoke all on function public.update_app_privacy_settings(uuid, smallint, smallint, smallint, smallint, smallint, boolean, text) from public, anon;
grant execute on function public.update_app_privacy_settings(uuid, smallint, smallint, smallint, smallint, smallint, boolean, text) to authenticated;

create or replace function public.run_app_privacy_retention(
  requested_app_id uuid,
  dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.app_privacy_settings%rowtype;
  click_count bigint;
  event_count bigint;
  debug_count bigint;
  postback_count bigint;
  oauth_count bigint;
begin
  select * into strict settings from public.app_privacy_settings where app_id = requested_app_id;
  select count(*) into click_count from public.link_clicks
    where app_id = requested_app_id and privacy_anonymized_at is null
      and clicked_at < statement_timestamp() - make_interval(days => settings.raw_click_retention_days);
  select count(*) into event_count from public.events
    where app_id = requested_app_id and privacy_anonymized_at is null
      and occurred_at < statement_timestamp() - make_interval(days => settings.event_properties_retention_days);
  select count(*) into debug_count from public.development_debug_events
    where app_id = requested_app_id
      and occurred_at < statement_timestamp() - make_interval(days => settings.debug_retention_days);
  select count(*) into postback_count from public.postback_attempts
    where app_id = requested_app_id and privacy_anonymized_at is null
      and attempted_at < statement_timestamp() - make_interval(days => settings.postback_detail_retention_days);

  if not dry_run then
    update public.link_clicks set
      utm_parameters = '{}'::jsonb, referrer_parameters = '{}'::jsonb,
      gclid = null, gbraid = null, wbraid = null, fbclid = null, ttclid = null,
      user_agent_hash = null, network_prefix_hash = null,
      privacy_anonymized_at = statement_timestamp()
    where app_id = requested_app_id and privacy_anonymized_at is null
      and clicked_at < statement_timestamp() - make_interval(days => settings.raw_click_retention_days);
    update public.events set properties = '{}'::jsonb, privacy_anonymized_at = statement_timestamp()
    where app_id = requested_app_id and privacy_anonymized_at is null
      and occurred_at < statement_timestamp() - make_interval(days => settings.event_properties_retention_days);
    delete from public.development_debug_events
    where app_id = requested_app_id
      and occurred_at < statement_timestamp() - make_interval(days => settings.debug_retention_days);
    update public.postback_attempts set
      response_excerpt = null, request_metadata = '{}'::jsonb,
      provider_request_id = null, privacy_anonymized_at = statement_timestamp()
    where app_id = requested_app_id and privacy_anonymized_at is null
      and attempted_at < statement_timestamp() - make_interval(days => settings.postback_detail_retention_days);
    update public.postback_jobs set payload = '{}'::jsonb, privacy_anonymized_at = statement_timestamp()
    where app_id = requested_app_id and privacy_anonymized_at is null
      and completed_at is not null
      and completed_at < statement_timestamp() - make_interval(days => settings.postback_detail_retention_days);
    delete from public.audit_log
    where app_id = requested_app_id
      and created_at < statement_timestamp() - make_interval(days => settings.audit_retention_days);
  end if;

  delete from private.connector_oauth_states where expires_at < statement_timestamp() - interval '1 day';
  get diagnostics oauth_count = row_count;
  return jsonb_build_object(
    'dryRun', dry_run, 'clicks', click_count, 'events', event_count,
    'debugEvents', debug_count, 'postbackAttempts', postback_count,
    'expiredOauthStatesRemoved', oauth_count
  );
end;
$$;

revoke all on function public.run_app_privacy_retention(uuid, boolean) from public, anon, authenticated;
grant execute on function public.run_app_privacy_retention(uuid, boolean) to service_role;

create or replace function public.export_app_user_data(
  requested_app_id uuid,
  requested_app_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_organization_id uuid;
  result jsonb;
begin
  select organization_id into strict requested_organization_id
  from public.app_users where id = requested_app_user_id and app_id = requested_app_id;
  if not (select private.has_organization_role(
    requested_organization_id, array['owner', 'admin']::public.organization_role[]
  )) then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'scope', 'app_user',
    'persistentIdentifierNotice', 'Los UUID de instalación y usuario son seudónimos persistentes dentro de una app; no son anonimato irreversible.',
    'profile', to_jsonb(app_user) - 'canonical_user_hash',
    'installations', coalesce((
      select jsonb_agg(to_jsonb(installation) - 'installation_key_hash' - 'installation_access_token_hash')
      from public.app_user_installations link
      join public.installations installation on installation.id = link.installation_id
      where link.app_user_id = requested_app_user_id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(event) order by event.occurred_at)
      from public.events event where event.app_user_id = requested_app_user_id
    ), '[]'::jsonb),
    'revenue', coalesce((
      select jsonb_agg(to_jsonb(entry) order by entry.occurred_at)
      from public.revenue_ledger entry where entry.app_user_id = requested_app_user_id
    ), '[]'::jsonb)
  ) into result
  from public.app_users app_user where app_user.id = requested_app_user_id;
  insert into public.audit_log (
    organization_id, app_id, actor_user_id, actor_kind, action, target_table, target_id
  ) values (
    requested_organization_id, requested_app_id, (select auth.uid()), 'user',
    'privacy.app_user_exported', 'app_users', requested_app_user_id
  );
  return result;
end;
$$;

create or replace function public.erase_app_user(
  requested_app_id uuid,
  requested_app_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare requested_organization_id uuid;
begin
  select organization_id into strict requested_organization_id
  from public.app_users where id = requested_app_user_id and app_id = requested_app_id;
  if current_user <> 'service_role' and not (select private.has_organization_role(
    requested_organization_id, array['owner', 'admin']::public.organization_role[]
  )) then raise exception 'forbidden' using errcode = '42501'; end if;

  update public.events set properties = '{}'::jsonb, privacy_anonymized_at = statement_timestamp()
  where app_user_id = requested_app_user_id;
  update public.identities set
    identity_hash = extensions.digest(gen_random_uuid()::text, 'sha256'), traits = '{}'::jsonb,
    valid_to = coalesce(valid_to, greatest(statement_timestamp(), valid_from + interval '1 microsecond')),
    updated_at = statement_timestamp()
  where app_user_id = requested_app_user_id;
  update public.installations installation set
    installation_key_hash = extensions.digest(gen_random_uuid()::text, 'sha256'),
    installation_access_token_hash = null,
    consent_state = 'denied', consent_analytics = false, consent_attribution = false,
    consent_advertising = false, consent_personalization = false,
    consent_updated_at = statement_timestamp(), privacy_anonymized_at = statement_timestamp(),
    updated_at = statement_timestamp()
  from public.app_user_installations link
  where link.app_user_id = requested_app_user_id and installation.id = link.installation_id;
  update public.purchases purchase set
    transaction_id = 'erased-' || gen_random_uuid()::text, order_id = null, updated_at = statement_timestamp()
  from public.app_user_installations link
  where link.app_user_id = requested_app_user_id and purchase.installation_id = link.installation_id;
  update public.subscriptions set
    external_subscription_id = 'erased-' || gen_random_uuid()::text,
    product_id = 'erased', updated_at = statement_timestamp()
  where app_user_id = requested_app_user_id;
  update public.subscription_events set
    subscription_id = 'erased-' || gen_random_uuid()::text,
    product_id = 'erased', transaction_id = null
  where app_user_id = requested_app_user_id;
  update public.revenue_ledger set
    transaction_id = 'erased-' || gen_random_uuid()::text,
    original_transaction_id = null, order_id = null, product_id = null,
    subscription_id = null, products = '[]'::jsonb, updated_at = statement_timestamp()
  where app_user_id = requested_app_user_id;
  update public.app_users set
    canonical_user_hash = null, identified_at = null, deleted_at = statement_timestamp(),
    updated_at = statement_timestamp()
  where id = requested_app_user_id;
  insert into public.audit_log (
    organization_id, app_id, actor_user_id, actor_kind, action, target_table, target_id
  ) values (
    requested_organization_id, requested_app_id, (select auth.uid()),
    case when (select auth.uid()) is null then 'service' else 'user' end,
    'privacy.app_user_erased', 'app_users', requested_app_user_id
  );
end;
$$;

revoke all on function public.export_app_user_data(uuid, uuid) from public, anon;
revoke all on function public.erase_app_user(uuid, uuid) from public, anon;
grant execute on function public.export_app_user_data(uuid, uuid) to authenticated;
grant execute on function public.erase_app_user(uuid, uuid) to authenticated, service_role;

create or replace function public.delete_app_data(
  requested_app_id uuid,
  requested_confirmation_slug text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare app_row public.apps%rowtype;
begin
  select * into strict app_row from public.apps where id = requested_app_id;
  if requested_confirmation_slug <> app_row.slug or not (select private.has_organization_role(
    app_row.organization_id, array['owner']::public.organization_role[]
  )) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, target_table, target_id,
    before_state
  ) values (
    app_row.organization_id, (select auth.uid()), 'user', 'privacy.app_deleted',
    'apps', app_row.id, jsonb_build_object('slug', app_row.slug)
  );
  delete from public.apps where id = requested_app_id;
end;
$$;

revoke all on function public.delete_app_data(uuid, text) from public, anon;
grant execute on function public.delete_app_data(uuid, text) to authenticated;

-- Extend the existing idempotent ingest transaction with explicit purpose flags.
create or replace function public.ingest_sdk_messages_v3(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ingest_result jsonb;
  message jsonb;
  current_installation_id uuid;
  requested_app_id uuid;
  requested_organization_id uuid;
  observed_at timestamptz;
  purpose_flags jsonb;
begin
  ingest_result := public.ingest_sdk_messages_v2(payload);
  for message in select value from jsonb_array_elements(payload -> 'messages') item(value)
  loop
    requested_app_id := (message ->> 'appId')::uuid;
    requested_organization_id := (message ->> 'organizationId')::uuid;
    if message ->> 'kind' in ('installation', 'identify') then
      current_installation_id := (message -> 'body' ->> 'installationId')::uuid;
      observed_at := (message -> 'body' ->> 'occurredAt')::timestamptz;
    else
      current_installation_id := ((message -> 'body' -> 'events' -> 0) ->> 'installationId')::uuid;
      observed_at := (message ->> 'receivedAt')::timestamptz;
    end if;
    perform private.ensure_installation_app_user(
      requested_organization_id, requested_app_id, current_installation_id, observed_at
    );
    if message ->> 'kind' = 'identify' then
      perform private.link_identified_user(
        requested_organization_id, requested_app_id, current_installation_id,
        extensions.digest(message -> 'body' ->> 'userId', 'sha256'), observed_at
      );
    elsif message ->> 'kind' = 'events'
      and jsonb_typeof(message -> 'body' -> 'identity') = 'object' then
      perform private.link_identified_user(
        requested_organization_id, requested_app_id, current_installation_id,
        extensions.digest(message -> 'body' -> 'identity' ->> 'userId', 'sha256'), observed_at
      );
    end if;

    purpose_flags := coalesce(message -> 'body' -> 'purposes', '{}'::jsonb);
    if jsonb_typeof(purpose_flags) = 'object' and purpose_flags <> '{}'::jsonb then
      update public.installations set
        consent_state = case when coalesce((purpose_flags ->> 'attribution')::boolean, false) then 'granted' else 'limited' end,
        consent_analytics = coalesce((purpose_flags ->> 'analytics')::boolean, false),
        consent_attribution = coalesce((purpose_flags ->> 'attribution')::boolean, false),
        consent_advertising = coalesce((purpose_flags ->> 'advertising')::boolean, false),
        consent_personalization = coalesce((purpose_flags ->> 'personalization')::boolean, false),
        consent_version = 'purposes-v1', consent_updated_at = observed_at,
        updated_at = statement_timestamp()
      where id = current_installation_id and app_id = requested_app_id;
    end if;

    update public.identities identity_row
    set app_user_id = link.app_user_id, updated_at = statement_timestamp()
    from public.app_user_installations link
    where link.app_id = requested_app_id
      and link.installation_id = current_installation_id
      and identity_row.app_id = requested_app_id
      and identity_row.installation_id = current_installation_id
      and identity_row.app_user_id <> link.app_user_id;
    perform private.process_installation_activity(current_installation_id);
  end loop;
  return ingest_result;
end;
$$;

revoke all on function public.ingest_sdk_messages_v3(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_sdk_messages_v3(jsonb) to service_role;

comment on column public.installations.consent_advertising is
  'Permiso de finalidad para enviar señales a plataformas publicitarias. No se deriva de forma implícita del consentimiento analítico.';
comment on column public.installations.privacy_anonymized_at is
  'Momento en que los identificadores persistentes se sustituyeron. Un UUID activo es seudónimo, no anonimato irreversible.';
comment on table public.app_privacy_settings is
  'Retención y finalidades por app. Los plazos eliminan payloads/identificadores y conservan importes agregados cuando son necesarios.';
