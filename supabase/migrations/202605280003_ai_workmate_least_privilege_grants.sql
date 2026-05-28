-- AI WorkMate Supabase least-privilege grant hardening.
-- This migration is non-destructive: it only narrows executable helper functions
-- exposed from the private schema after the core schema migration has created them.

revoke execute on all functions in schema app_private from public;
revoke execute on all functions in schema app_private from anon;
revoke execute on all functions in schema app_private from authenticated;
revoke execute on all functions in schema app_private from service_role;

grant usage on schema app_private to anon, authenticated, service_role;

-- Predicate helpers used by RLS policies and Storage object path checks.
grant execute on function app_private.safe_uuid(text) to anon, authenticated, service_role;
grant execute on function app_private.is_platform_admin() to anon, authenticated, service_role;
grant execute on function app_private.is_org_member(uuid) to anon, authenticated, service_role;
grant execute on function app_private.is_org_admin(uuid) to anon, authenticated, service_role;
grant execute on function app_private.workspace_role(uuid) to anon, authenticated, service_role;
grant execute on function app_private.can_read_workspace(uuid) to anon, authenticated, service_role;
grant execute on function app_private.can_write_workspace(uuid) to anon, authenticated, service_role;
grant execute on function app_private.shares_org_with_user(uuid) to anon, authenticated, service_role;

-- Trigger functions and automatic bootstrap handlers intentionally remain ungranted.
-- They are invoked by table/auth triggers, not by frontend clients or RPC calls.
