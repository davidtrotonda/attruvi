-- complete_personal_onboarding returns a column named app_id. In PL/pgSQL that
-- output column is also a variable, so an inferred conflict target such as
-- ON CONFLICT (app_id, platform) is ambiguous. Referencing the existing named
-- unique constraint is explicit and keeps the operation idempotent.
do $$
declare
  previous_definition text;
  corrected_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.complete_personal_onboarding(text,text,text,text,text,text,text)'::regprocedure
  ) into previous_definition;

  corrected_definition := pg_catalog.replace(
    previous_definition,
    'on conflict (app_id, platform) do update',
    'on conflict on constraint app_platforms_unique_platform do update'
  );

  if corrected_definition = previous_definition then
    raise exception 'onboarding app platform conflict target not found';
  end if;

  if corrected_definition like '%on conflict (app_id, platform) do update%' then
    raise exception 'onboarding app platform conflict target remains ambiguous';
  end if;

  execute corrected_definition;
end;
$$;

comment on function public.complete_personal_onboarding(
  text, text, text, text, text, text, text
) is
  'Completes the caller personal workspace and first app atomically after validating platform identifiers, currency and timezone. Platform upserts use the named unique constraint to avoid PL/pgSQL output-column ambiguity.';
