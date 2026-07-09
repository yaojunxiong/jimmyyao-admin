-- Extend read-only user detail RPC with VIP / membership metadata.

CREATE OR REPLACE FUNCTION public.admin_get_user_detail(p_user_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid;
  v_is_admin boolean;
  v_summary record;
  v_user_id uuid;
  v_email text;
BEGIN
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_current_user_id AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT * INTO v_summary
  FROM public.admin_get_user_summary()
  WHERE user_key = p_user_key
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  v_user_id := v_summary.user_id;
  v_email := lower(nullif(trim(v_summary.email), ''));

  RETURN jsonb_build_object(
    'success', true,
    'summary', to_jsonb(v_summary),
    'membership', COALESCE((
      SELECT to_jsonb(x)
      FROM (
        SELECT
          ur.role,
          ur.vip_until,
          ur.note,
          ur.created_at AS role_created_at,
          ur.updated_at AS role_updated_at,
          um.level AS membership_level,
          um.created_at AS membership_created_at,
          um.updated_at AS membership_updated_at
        FROM public.user_roles ur
        LEFT JOIN public.user_memberships um ON um.user_id = ur.user_id
        WHERE (v_user_id IS NOT NULL AND ur.user_id = v_user_id)
           OR (v_email IS NOT NULL AND lower(nullif(trim(ur.email), '')) = v_email)
        ORDER BY ur.updated_at DESC
        LIMIT 1
      ) x
    ), '{}'::jsonb),
    'membership_requests', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          mr.id,
          mr.current_level,
          mr.requested_level,
          mr.reason,
          mr.status,
          mr.reviewed_at,
          mr.review_note,
          mr.reject_reason,
          mr.workflow_instance_id,
          wi.status AS workflow_status,
          wi.current_node_key AS workflow_current_node_key,
          wi.created_at AS workflow_created_at,
          wi.updated_at AS workflow_updated_at,
          mr.created_at,
          mr.updated_at
        FROM public.membership_requests mr
        LEFT JOIN public.workflow_instances wi ON wi.id = mr.workflow_instance_id
        WHERE v_user_id IS NOT NULL AND mr.user_id = v_user_id
        ORDER BY mr.created_at DESC
        LIMIT 10
      ) x
    ), '[]'::jsonb),
    'visitor_events', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT id, path, page_type, referrer, ip, user_agent, created_at
        FROM public.visitor_activity_events
        WHERE (v_user_id IS NOT NULL AND user_id = v_user_id)
           OR (v_email IS NOT NULL AND lower(nullif(trim(coalesce(email, user_email)), '')) = v_email)
        ORDER BY created_at DESC
        LIMIT 50
      ) x
    ), '[]'::jsonb),
    'forum_posts', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT id, title, status, category, created_at
        FROM public.forum_posts
        WHERE (v_user_id IS NOT NULL AND author_user_id = v_user_id)
           OR (v_email IS NOT NULL AND lower(nullif(trim(author_email), '')) = v_email)
        ORDER BY created_at DESC
        LIMIT 20
      ) x
    ), '[]'::jsonb),
    'forum_comments', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT id, post_id, left(body, 240) AS body, is_deleted, created_at
        FROM public.forum_comments
        WHERE (v_user_id IS NOT NULL AND author_user_id = v_user_id)
           OR (v_email IS NOT NULL AND lower(nullif(trim(author_email), '')) = v_email)
        ORDER BY created_at DESC
        LIMIT 20
      ) x
    ), '[]'::jsonb),
    'lesson_progress', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC)
      FROM (
        SELECT id, user_key, lesson_id, created_at, updated_at
        FROM public.lesson_progress
        WHERE (v_user_id IS NOT NULL AND user_id = v_user_id)
           OR (v_email IS NOT NULL AND lower(nullif(trim(user_email), '')) = v_email)
        ORDER BY updated_at DESC
        LIMIT 20
      ) x
    ), '[]'::jsonb),
    'attempts', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT id, lesson_no, item_type, item_id, mode, is_correct, created_at
        FROM public.user_attempts
        WHERE v_user_id IS NOT NULL AND user_id = v_user_id
        ORDER BY created_at DESC
        LIMIT 20
      ) x
    ), '[]'::jsonb)
  );
END;
$$;
