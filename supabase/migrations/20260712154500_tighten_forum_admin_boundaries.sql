-- Administrator membership in public.user_roles is now the authoritative
-- source. Remove the legacy email bypass so role removal takes effect
-- consistently across Forum and lesson-management RLS policies.

create or replace function private.forum_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.is_admin_user(), false);
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.is_admin_user(), false);
$$;

-- The Admin UI only reads this non-updatable security-invoker view. Remove
-- inherited write-like privileges and anonymous access, while preserving the
-- authenticated Admin UI and service-role read paths.
revoke all privileges on table public.latest_comment_admin_action
from public, anon, authenticated, service_role;

grant select on table public.latest_comment_admin_action
to authenticated, service_role;

notify pgrst, 'reload schema';
