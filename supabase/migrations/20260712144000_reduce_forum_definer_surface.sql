-- Remove an unused privileged RPC that embeds administrator notification
-- addresses. Current production applications have no caller, and the database
-- has no dependent object.
drop function public.forum_admin_notification_emails();

-- These trigger helpers only normalize NEW/OLD rows and consult auth claims or
-- an explicitly qualified admin helper. They do not need owner privileges.
alter function public.forum_comment_insert_defaults()
  security invoker;

alter function public.forum_comment_insert_defaults()
  set search_path = '';

alter function public.forum_guard_user_post_update()
  security invoker;

alter function public.forum_guard_user_post_update()
  set search_path = '';

notify pgrst, 'reload schema';
