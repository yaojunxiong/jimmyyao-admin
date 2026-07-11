-- These functions are invoked only by database triggers, not as Data API RPCs.
-- Keep trusted server/owner execution available while removing direct client
-- execution from the exposed public schema.

revoke execute
  on function public.forum_comment_insert_defaults()
  from public, anon, authenticated;
grant execute
  on function public.forum_comment_insert_defaults()
  to service_role;

revoke execute
  on function public.forum_guard_user_post_update()
  from public, anon, authenticated;
grant execute
  on function public.forum_guard_user_post_update()
  to service_role;

revoke execute
  on function public.forum_sync_bookmark_count()
  from public, anon, authenticated;
grant execute
  on function public.forum_sync_bookmark_count()
  to service_role;

revoke execute
  on function public.forum_sync_comment_count()
  from public, anon, authenticated;
grant execute
  on function public.forum_sync_comment_count()
  to service_role;

revoke execute
  on function public.forum_sync_like_count()
  from public, anon, authenticated;
grant execute
  on function public.forum_sync_like_count()
  to service_role;

notify pgrst, 'reload schema';
