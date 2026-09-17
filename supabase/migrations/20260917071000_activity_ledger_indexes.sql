-- Cover every composite foreign key introduced by the activity ledger.
create index if not exists activity_sessions_installation_fk_idx
  on public.activity_sessions (installation_id, organization_id, app_id);
create index if not exists activity_sessions_user_fk_idx
  on public.activity_sessions (app_user_id, organization_id, app_id);
create index if not exists app_user_installations_installation_fk_idx
  on public.app_user_installations (installation_id, organization_id, app_id);
create index if not exists app_user_installations_user_fk_idx
  on public.app_user_installations (app_user_id, organization_id, app_id);
create index if not exists app_user_metrics_user_fk_idx
  on public.app_user_metrics (app_user_id, organization_id, app_id);
create index if not exists app_users_app_fk_idx
  on public.app_users (app_id, organization_id);
create index if not exists app_users_merged_into_fk_idx
  on public.app_users (merged_into_id, organization_id, app_id);
create index if not exists events_activity_session_fk_idx
  on public.events (activity_session_id, organization_id, app_id);
create index if not exists events_app_user_fk_idx
  on public.events (app_user_id, organization_id, app_id);
create index if not exists events_attribution_fk_idx
  on public.events (attribution_id, organization_id, app_id);
create index if not exists identities_app_user_fk_idx
  on public.identities (app_user_id, organization_id, app_id);
create index if not exists installation_activity_metrics_installation_fk_idx
  on public.installation_activity_metrics (installation_id, organization_id, app_id);
create index if not exists installation_activity_metrics_user_fk_idx
  on public.installation_activity_metrics (app_user_id, organization_id, app_id);
create index if not exists push_token_invalidations_installation_fk_idx
  on public.push_token_invalidations (installation_id, organization_id, app_id);
create index if not exists revenue_ledger_attribution_fk_idx
  on public.revenue_ledger (attribution_id, organization_id, app_id);
create index if not exists revenue_ledger_event_fk_idx
  on public.revenue_ledger (event_id, organization_id, app_id);
create index if not exists revenue_ledger_installation_fk_idx
  on public.revenue_ledger (installation_id, organization_id, app_id);
create index if not exists revenue_ledger_user_fk_idx
  on public.revenue_ledger (app_user_id, organization_id, app_id);
create index if not exists revenue_validations_entry_fk_idx
  on public.revenue_validations (revenue_entry_id, organization_id, app_id);
create index if not exists subscription_events_event_fk_idx
  on public.subscription_events (event_id, organization_id, app_id);
create index if not exists subscription_events_installation_fk_idx
  on public.subscription_events (installation_id, organization_id, app_id);
create index if not exists subscription_events_user_fk_idx
  on public.subscription_events (app_user_id, organization_id, app_id);
create index if not exists subscriptions_app_user_fk_idx
  on public.subscriptions (app_user_id, organization_id, app_id);
create index if not exists uninstall_inferences_installation_fk_idx
  on public.uninstall_inferences (installation_id, organization_id, app_id);
