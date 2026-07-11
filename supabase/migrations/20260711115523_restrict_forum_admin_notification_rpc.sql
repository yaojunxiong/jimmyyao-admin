-- This SECURITY DEFINER helper returns administrator notification addresses.
-- It has no public Forum or admin-repository caller, so keep it available only
-- to trusted server-side service_role code and the function owner.

revoke execute
  on function public.forum_admin_notification_emails()
  from public;

revoke execute
  on function public.forum_admin_notification_emails()
  from anon, authenticated;

grant execute
  on function public.forum_admin_notification_emails()
  to service_role;

notify pgrst, 'reload schema';
