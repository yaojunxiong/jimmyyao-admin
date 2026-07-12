-- The current Forum application has no view-counter caller. Keep the
-- implementation for a future rate-limited server endpoint, but prevent
-- anonymous and signed-in clients from inflating counts with repeated RPCs.

revoke execute on function public.increment_forum_post_view(uuid)
from public, anon, authenticated;

revoke execute on function private.increment_forum_post_view(uuid)
from public, anon, authenticated;

grant execute on function public.increment_forum_post_view(uuid)
to service_role;

grant execute on function private.increment_forum_post_view(uuid)
to service_role;

notify pgrst, 'reload schema';
