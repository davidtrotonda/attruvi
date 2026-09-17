create index if not exists attribution_rule_sets_app_fk_idx
  on public.attribution_rule_sets (app_id, organization_id);

create index if not exists attribution_rule_sets_created_by_fk_idx
  on public.attribution_rule_sets (created_by)
  where created_by is not null;
