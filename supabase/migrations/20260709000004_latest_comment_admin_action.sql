-- Latest comment admin action per comment (read-only view)
-- Created with security_invoker so RLS on forum_comment_admin_actions is
-- enforced against the calling user, not the view definer.

CREATE OR REPLACE VIEW public.latest_comment_admin_action
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (comment_id)
  id,
  comment_id,
  post_id,
  action,
  previous_is_deleted,
  next_is_deleted,
  actor_user_id,
  actor_email,
  created_at
FROM public.forum_comment_admin_actions
ORDER BY comment_id, created_at DESC;
