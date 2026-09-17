-- Avoid a PL/pgSQL variable/column collision exercised by the setup debugger.
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

    update public.identities identity_row
    set app_user_id = link.app_user_id,
        updated_at = statement_timestamp()
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
