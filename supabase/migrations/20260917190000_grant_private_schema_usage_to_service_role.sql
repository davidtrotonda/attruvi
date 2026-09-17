-- Service RPCs intentionally call a small allowlist of private helper
-- functions. EXECUTE on those functions is not sufficient without schema
-- USAGE, so fresh deployments returned 403 while consuming queued events.
grant usage on schema private to service_role;
grant execute on function private.is_organization_member(uuid) to service_role;
grant execute on function private.has_organization_role(uuid, public.organization_role[]) to service_role;

revoke usage on schema private from public, anon;

comment on schema private is
  'Internal helpers. Only authenticated membership checks and explicitly granted service jobs may cross this boundary.';
