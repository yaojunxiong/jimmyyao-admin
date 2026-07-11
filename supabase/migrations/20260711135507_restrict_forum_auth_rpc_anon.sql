-- These SECURITY DEFINER functions support signed-in Forum author/admin flows.
-- Remove anonymous Data API execution while preserving authenticated and
-- trusted server execution.

revoke execute
  on function public.forum_create_post(uuid, text, text)
  from public, anon;
grant execute
  on function public.forum_create_post(uuid, text, text)
  to authenticated, service_role;

revoke execute
  on function public.forum_review_post(uuid, text, text)
  from public, anon;
grant execute
  on function public.forum_review_post(uuid, text, text)
  to authenticated, service_role;

revoke execute
  on function public.forum_unique_post_slug(text)
  from public, anon;
grant execute
  on function public.forum_unique_post_slug(text)
  to authenticated, service_role;

revoke execute
  on function public.forum_update_pending_post(uuid, uuid, text, text)
  from public, anon;
grant execute
  on function public.forum_update_pending_post(uuid, uuid, text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
