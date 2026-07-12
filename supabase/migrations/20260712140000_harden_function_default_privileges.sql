-- Prevent future functions from silently inheriting client EXECUTE access.
-- Existing function ACLs are unchanged; client-callable RPCs must continue to
-- receive explicit grants in the migration that creates them.

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- The private schema is usable by client roles for RLS helper calls, so its
-- future functions need the same deny-by-default boundary.
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema private
  grant execute on functions to service_role;
