drop index if exists public.postback_destinations_connector_idx;

create index postback_destinations_connector_fk_idx
  on public.postback_destinations (connector_account_id, organization_id, app_id);
