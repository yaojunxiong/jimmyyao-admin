-- Admin forum post status update with audit logging
-- Wraps update + audit log insert in a single DB transaction
-- Called via supabase.rpc('admin_update_forum_post_status', ...)

CREATE OR REPLACE FUNCTION public.admin_update_forum_post_status(
  p_post_id uuid,
  p_action text,
  p_review_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_is_admin boolean;
  v_previous_status text;
  v_previous_is_deleted boolean;
  v_next_status text;
  v_next_is_deleted boolean;
  v_now timestamptz;
BEGIN
  -- === Authentication check ===
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  v_user_email := auth.email();

  -- === Admin role check ===
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- === Validate action ===
  IF p_action NOT IN ('approve', 'reject', 'hide', 'restore') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;

  -- === Read current post state ===
  SELECT status, is_deleted
    INTO v_previous_status, v_previous_is_deleted
  FROM public.forum_posts
  WHERE id = p_post_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'post_not_found');
  END IF;

  v_now := now();

  -- === Apply update ===
  CASE p_action
    WHEN 'approve' THEN
      UPDATE public.forum_posts SET
        status       = 'approved',
        reviewed_by  = v_user_id,
        reviewed_at  = v_now,
        review_note  = p_review_note,
        is_deleted   = false,
        updated_at   = v_now
      WHERE id = p_post_id
      RETURNING status, is_deleted INTO v_next_status, v_next_is_deleted;

    WHEN 'reject' THEN
      UPDATE public.forum_posts SET
        status       = 'rejected',
        reviewed_by  = v_user_id,
        reviewed_at  = v_now,
        review_note  = p_review_note,
        updated_at   = v_now
      WHERE id = p_post_id
      RETURNING status, is_deleted INTO v_next_status, v_next_is_deleted;

    WHEN 'hide' THEN
      UPDATE public.forum_posts SET
        status       = 'hidden',
        reviewed_by  = v_user_id,
        reviewed_at  = v_now,
        review_note  = p_review_note,
        updated_at   = v_now
      WHERE id = p_post_id
      RETURNING status, is_deleted INTO v_next_status, v_next_is_deleted;

    WHEN 'restore' THEN
      UPDATE public.forum_posts SET
        is_deleted   = false,
        updated_at   = v_now
      WHERE id = p_post_id
      RETURNING status, is_deleted INTO v_next_status, v_next_is_deleted;
  END CASE;

  -- === Insert audit log ===
  INSERT INTO public.forum_admin_actions (
    post_id, action,
    previous_status, next_status,
    previous_is_deleted, next_is_deleted,
    review_note, actor_user_id, actor_email,
    created_at
  ) VALUES (
    p_post_id, p_action,
    v_previous_status, v_next_status,
    v_previous_is_deleted, v_next_is_deleted,
    p_review_note, v_user_id, v_user_email,
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'action', p_action,
    'new_status', v_next_status,
    'new_is_deleted', v_next_is_deleted
  );
END;
$$;
