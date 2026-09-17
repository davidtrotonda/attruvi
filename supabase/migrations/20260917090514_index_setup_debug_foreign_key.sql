create index if not exists development_debug_events_app_fk_idx
  on public.development_debug_events (app_id, organization_id);
