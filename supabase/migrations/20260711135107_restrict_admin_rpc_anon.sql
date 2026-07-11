-- These RPCs expose administrative user and Forum operations. They already
-- enforce an authenticated admin check internally; remove anonymous execution
-- at the database privilege boundary while preserving signed-in admin calls.

revoke execute
  on function public.admin_get_user_detail(text)
  from public, anon;
grant execute
  on function public.admin_get_user_detail(text)
  to authenticated, service_role;

revoke execute
  on function public.admin_get_user_summary()
  from public, anon;
grant execute
  on function public.admin_get_user_summary()
  to authenticated, service_role;

revoke execute
  on function public.admin_update_forum_comment_status(uuid, text)
  from public, anon;
grant execute
  on function public.admin_update_forum_comment_status(uuid, text)
  to authenticated, service_role;

revoke execute
  on function public.admin_update_forum_post_status(uuid, text, text)
  from public, anon;
grant execute
  on function public.admin_update_forum_post_status(uuid, text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
