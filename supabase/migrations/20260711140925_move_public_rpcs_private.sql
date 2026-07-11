-- Move the remaining client-callable SECURITY DEFINER implementations out of
-- the exposed schema. Public SECURITY INVOKER wrappers preserve PostgREST RPC
-- names, parameter names/defaults, return shapes, and role access.

alter function public.admin_get_user_detail(text) set schema private;
alter function public.admin_get_user_summary() set schema private;
alter function public.admin_update_forum_comment_status(uuid, text) set schema private;
alter function public.admin_update_forum_post_status(uuid, text, text) set schema private;
alter function public.forum_create_post(uuid, text, text) set schema private;
alter function public.forum_review_post(uuid, text, text) set schema private;
alter function public.forum_unique_post_slug(text) set schema private;
alter function public.forum_update_pending_post(uuid, uuid, text, text) set schema private;
alter function public.increment_forum_post_view(uuid) set schema private;

revoke execute on function
  private.admin_get_user_detail(text),
  private.admin_get_user_summary(),
  private.admin_update_forum_comment_status(uuid, text),
  private.admin_update_forum_post_status(uuid, text, text),
  private.forum_create_post(uuid, text, text),
  private.forum_review_post(uuid, text, text),
  private.forum_unique_post_slug(text),
  private.forum_update_pending_post(uuid, uuid, text, text),
  private.increment_forum_post_view(uuid)
from public, anon, authenticated;

grant execute on function
  private.admin_get_user_detail(text),
  private.admin_get_user_summary(),
  private.admin_update_forum_comment_status(uuid, text),
  private.admin_update_forum_post_status(uuid, text, text),
  private.forum_create_post(uuid, text, text),
  private.forum_review_post(uuid, text, text),
  private.forum_unique_post_slug(text),
  private.forum_update_pending_post(uuid, uuid, text, text)
to authenticated, service_role;

grant execute on function private.increment_forum_post_view(uuid)
to anon, authenticated, service_role;

create function public.admin_get_user_detail(p_user_key text)
returns jsonb
language sql security invoker set search_path = ''
as $$ select private.admin_get_user_detail($1) $$;

create function public.admin_get_user_summary()
returns table(
  user_key text,
  user_id uuid,
  email text,
  display_name text,
  avatar_url text,
  role text,
  vip_until timestamptz,
  created_at timestamptz,
  last_activity_at timestamptz,
  visitor_event_count bigint,
  forum_post_count bigint,
  forum_comment_count bigint,
  lesson_progress_count bigint,
  attempt_count bigint,
  is_admin boolean
)
language sql security invoker set search_path = ''
as $$ select * from private.admin_get_user_summary() $$;

create function public.admin_update_forum_comment_status(
  p_comment_id uuid,
  p_action text
)
returns jsonb
language sql security invoker set search_path = ''
as $$ select private.admin_update_forum_comment_status($1, $2) $$;

create function public.admin_update_forum_post_status(
  p_post_id uuid,
  p_action text,
  p_review_note text default null
)
returns jsonb
language sql security invoker set search_path = ''
as $$ select private.admin_update_forum_post_status($1, $2, $3) $$;

create function public.forum_create_post(
  p_category_id uuid,
  p_title text,
  p_body text
)
returns table(id uuid, slug text, status text)
language sql security invoker set search_path = ''
as $$ select * from private.forum_create_post($1, $2, $3) $$;

create function public.forum_review_post(
  p_post_id uuid,
  p_status text,
  p_review_note text default null
)
returns table(id uuid, slug text, status text, reviewed_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from private.forum_review_post($1, $2, $3) $$;

create function public.forum_unique_post_slug(input_title text)
returns text
language sql security invoker set search_path = ''
as $$ select private.forum_unique_post_slug($1) $$;

create function public.forum_update_pending_post(
  p_post_id uuid,
  p_category_id uuid,
  p_title text,
  p_body text
)
returns table(id uuid, slug text, status text)
language sql security invoker set search_path = ''
as $$ select * from private.forum_update_pending_post($1, $2, $3, $4) $$;

create function public.increment_forum_post_view(p_post_id uuid)
returns void
language sql security invoker set search_path = ''
as $$ select private.increment_forum_post_view($1) $$;

revoke execute on function
  public.admin_get_user_detail(text),
  public.admin_get_user_summary(),
  public.admin_update_forum_comment_status(uuid, text),
  public.admin_update_forum_post_status(uuid, text, text),
  public.forum_create_post(uuid, text, text),
  public.forum_review_post(uuid, text, text),
  public.forum_unique_post_slug(text),
  public.forum_update_pending_post(uuid, uuid, text, text),
  public.increment_forum_post_view(uuid)
from public, anon, authenticated;

grant execute on function
  public.admin_get_user_detail(text),
  public.admin_get_user_summary(),
  public.admin_update_forum_comment_status(uuid, text),
  public.admin_update_forum_post_status(uuid, text, text),
  public.forum_create_post(uuid, text, text),
  public.forum_review_post(uuid, text, text),
  public.forum_unique_post_slug(text),
  public.forum_update_pending_post(uuid, uuid, text, text)
to authenticated, service_role;

grant execute on function public.increment_forum_post_view(uuid)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
