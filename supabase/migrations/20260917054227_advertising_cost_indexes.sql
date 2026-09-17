-- Cover every foreign key introduced by the advertising-cost subsystem.  The
-- column order intentionally matches each constraint so updates and deletes on
-- the parent rows do not require a full scan as these tables grow.
create index if not exists ad_cost_mappings_account_fk_idx
  on public.ad_cost_mappings (connector_account_id, organization_id, app_id);

create index if not exists ad_cost_mappings_app_fk_idx
  on public.ad_cost_mappings (app_id, organization_id);

create index if not exists ad_cost_mappings_created_by_fk_idx
  on public.ad_cost_mappings (created_by)
  where created_by is not null;
