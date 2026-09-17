-- Cover privacy and one-time OAuth-state foreign keys so tenant cleanup and
-- cascades do not require full scans as the installation grows.
create index if not exists app_privacy_settings_app_organization_idx
  on public.app_privacy_settings (app_id, organization_id);

create index if not exists connector_oauth_states_app_organization_idx
  on private.connector_oauth_states (app_id, organization_id);

create index if not exists connector_oauth_states_organization_idx
  on private.connector_oauth_states (organization_id);

create index if not exists connector_oauth_states_user_idx
  on private.connector_oauth_states (user_id);
