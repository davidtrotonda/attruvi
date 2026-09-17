do $$
declare
  function_oid regprocedure;
  function_definition text;
begin
  foreach function_oid in array array[
    'public.recalculate_personal_attribution(uuid,uuid,public.attribution_scope,uuid,timestamp with time zone,jsonb,text,boolean)'::regprocedure,
    'public.correct_personal_attribution(uuid,uuid,public.attribution_scope,uuid,jsonb,text)'::regprocedure
  ]
  loop
    select pg_catalog.pg_get_functiondef(function_oid)
      into function_definition;
    if function_definition like '%actor_id%'
      or function_definition like '%entity_type%'
      or function_definition like '%entity_id%' then
      function_definition := replace(function_definition, 'actor_id', 'actor_user_id');
      function_definition := replace(function_definition, 'entity_type', 'target_table');
      function_definition := replace(function_definition, 'entity_id', 'target_id');
      execute function_definition;
    end if;
  end loop;
end;
$$;

comment on function public.correct_personal_attribution(
  uuid, uuid, public.attribution_scope, uuid, jsonb, text
) is
  'Owner/admin-only audited manual correction. The reason is mandatory and the previous decision remains historical.';
