-- Forum Comment Admin Actions audit table
CREATE TABLE IF NOT EXISTS public.forum_comment_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.forum_comments(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.forum_posts(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('hide', 'restore')),
  previous_is_deleted boolean,
  next_is_deleted boolean,
  actor_user_id uuid REFERENCES auth.users(id),
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forum_comment_admin_actions_comment_id
  ON public.forum_comment_admin_actions(comment_id);
CREATE INDEX IF NOT EXISTS idx_forum_comment_admin_actions_created_at
  ON public.forum_comment_admin_actions(created_at DESC);

ALTER TABLE public.forum_comment_admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_admin_actions_select_admin" ON public.forum_comment_admin_actions
  FOR SELECT TO authenticated
  USING ((SELECT role FROM public.user_roles WHERE user_id = auth.uid()) = 'admin');

CREATE POLICY "comment_admin_actions_insert_admin" ON public.forum_comment_admin_actions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM public.user_roles WHERE user_id = auth.uid()) = 'admin');

-- RPC: admin update forum comment status (hide / restore)
CREATE OR REPLACE FUNCTION public.admin_update_forum_comment_status(
  p_comment_id uuid,
  p_action text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_is_admin boolean;
  v_current_is_deleted boolean;
  v_post_id uuid;
  v_now timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  v_user_email := auth.email();

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF p_action NOT IN ('hide', 'restore') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;

  SELECT is_deleted, post_id
    INTO v_current_is_deleted, v_post_id
  FROM public.forum_comments
  WHERE id = p_comment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'comment_not_found');
  END IF;

  v_now := now();

  IF p_action = 'hide' THEN
    UPDATE public.forum_comments SET
      is_deleted  = true,
      updated_at  = v_now
    WHERE id = p_comment_id;
  ELSE
    UPDATE public.forum_comments SET
      is_deleted  = false,
      updated_at  = v_now
    WHERE id = p_comment_id;
  END IF;

  INSERT INTO public.forum_comment_admin_actions (
    comment_id, post_id, action,
    previous_is_deleted, next_is_deleted,
    actor_user_id, actor_email, created_at
  ) VALUES (
    p_comment_id, v_post_id, p_action,
    v_current_is_deleted, (p_action = 'restore'),
    v_user_id, v_user_email, v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'comment_id', p_comment_id,
    'post_id', v_post_id,
    'action', p_action,
    'new_is_deleted', (p_action = 'restore')
  );
END;
$$;
