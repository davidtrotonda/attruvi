do $$
declare
  previous_definition text;
  corrected_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.ingest_sdk_messages(jsonb)'::regprocedure
  ) into previous_definition;

  corrected_definition := pg_catalog.regexp_replace(
    previous_definition,
    'select distinct on \(app_id, session_id\)\s+session_id, organization_id, app_id, installation_id, session_id::text, started_at\s+from session_inputs\s+order by app_id, session_id',
    'select distinct on (session_input.app_id, session_input.session_id)
    session_input.session_id,
    session_input.organization_id,
    session_input.app_id,
    session_input.installation_id,
    session_input.session_id::text,
    session_input.started_at
  from session_inputs session_input
  order by session_input.app_id, session_input.session_id',
    'n'
  );

  if corrected_definition = previous_definition then
    raise exception 'ingest session qualification target not found';
  end if;

  execute corrected_definition;
end;
$$;
