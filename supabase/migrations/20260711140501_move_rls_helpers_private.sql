-- Keep RLS helper implementations outside the exposed Data API schema while
-- preserving their existing OIDs so policy dependencies follow automatically.
-- Public SECURITY INVOKER wrappers retain backward-compatible RPC/function
-- names without exposing privileged implementations.

grant usage on schema private to anon, authenticated, service_role;

alter function public.forum_can_select_post(uuid) set schema private;
alter function public.forum_is_admin() set schema private;
alter function public.forum_parent_comment_matches(uuid, uuid) set schema private;
alter function public.is_admin() set schema private;
alter function public.is_admin_user() set schema private;
alter function public.is_minna_admin() set schema private;

revoke execute on function
  private.forum_can_select_post(uuid),
  private.forum_is_admin(),
  private.forum_parent_comment_matches(uuid, uuid),
  private.is_admin(),
  private.is_admin_user(),
  private.is_minna_admin()
from public;

grant execute on function
  private.forum_can_select_post(uuid),
  private.forum_is_admin(),
  private.forum_parent_comment_matches(uuid, uuid),
  private.is_admin(),
  private.is_admin_user(),
  private.is_minna_admin()
to anon, authenticated, service_role;

create function public.forum_can_select_post(p_post_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.forum_can_select_post($1) $$;

create function public.forum_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.forum_is_admin() $$;

create function public.forum_parent_comment_matches(
  p_parent_comment_id uuid,
  p_post_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.forum_parent_comment_matches($1, $2) $$;

create function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_admin() $$;

create function public.is_admin_user()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_admin_user() $$;

create function public.is_minna_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_minna_admin() $$;

revoke execute on function
  public.forum_can_select_post(uuid),
  public.forum_is_admin(),
  public.forum_parent_comment_matches(uuid, uuid),
  public.is_admin(),
  public.is_admin_user(),
  public.is_minna_admin()
from public;

grant execute on function
  public.forum_can_select_post(uuid),
  public.forum_is_admin(),
  public.forum_parent_comment_matches(uuid, uuid),
  public.is_admin(),
  public.is_admin_user(),
  public.is_minna_admin()
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
