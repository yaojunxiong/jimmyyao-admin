-- Fix ambiguous user_id references in admin read-only RPCs.

-- Unified read-only admin user summary RPC.
-- Does not read auth.users and does not expose sensitive auth fields.

CREATE OR REPLACE FUNCTION public.admin_get_user_summary()
RETURNS TABLE (
  user_key text,
  user_id uuid,
  email text,
  display_name text,
  avatar_url text,
  role text,
  vip_until timestamptz,
  created_at timestamptz,
  last_activity_at timestamptz,
  visitor_event_count bigint,
  forum_post_count bigint,
  forum_comment_count bigint,
  lesson_progress_count bigint,
  attempt_count bigint,
  is_admin boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_user_id
      AND ur.role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH raw_sources AS (
    SELECT
      p.id AS raw_user_id,
      lower(nullif(trim(p.email), '')) AS raw_email,
      p.display_name,
      p.avatar_url,
      NULL::text AS raw_role,
      NULL::timestamptz AS raw_vip_until,
      p.created_at AS source_created_at,
      p.updated_at AS activity_at,
      0::bigint AS visitor_event_count,
      0::bigint AS forum_post_count,
      0::bigint AS forum_comment_count,
      0::bigint AS lesson_progress_count,
      0::bigint AS attempt_count
    FROM public.profiles p

    UNION ALL

    SELECT
      ur.user_id AS raw_user_id,
      lower(nullif(trim(ur.email), '')) AS raw_email,
      NULL::text AS display_name,
      NULL::text AS avatar_url,
      ur.role AS raw_role,
      ur.vip_until AS raw_vip_until,
      ur.created_at AS source_created_at,
      ur.updated_at AS activity_at,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint
    FROM public.user_roles ur

    UNION ALL

    SELECT
      vae.user_id AS raw_user_id,
      lower(nullif(trim(coalesce(vae.email, vae.user_email)), '')) AS raw_email,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::timestamptz,
      vae.created_at,
      vae.created_at,
      1::bigint,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint
    FROM public.visitor_activity_events vae
    WHERE vae.user_id IS NOT NULL OR coalesce(vae.email, vae.user_email) IS NOT NULL

    UNION ALL

    SELECT
      fp.author_user_id AS raw_user_id,
      lower(nullif(trim(fp.author_email), '')) AS raw_email,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::timestamptz,
      fp.created_at,
      fp.created_at,
      0::bigint,
      1::bigint,
      0::bigint,
      0::bigint,
      0::bigint
    FROM public.forum_posts fp

    UNION ALL

    SELECT
      fc.author_user_id AS raw_user_id,
      lower(nullif(trim(fc.author_email), '')) AS raw_email,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::timestamptz,
      fc.created_at,
      fc.created_at,
      0::bigint,
      0::bigint,
      1::bigint,
      0::bigint,
      0::bigint
    FROM public.forum_comments fc

    UNION ALL

    SELECT
      lp.user_id AS raw_user_id,
      lower(nullif(trim(lp.user_email), '')) AS raw_email,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::timestamptz,
      lp.created_at,
      greatest(lp.created_at, lp.updated_at),
      0::bigint,
      0::bigint,
      0::bigint,
      1::bigint,
      0::bigint
    FROM public.lesson_progress lp
    WHERE lp.user_id IS NOT NULL OR lp.user_email IS NOT NULL

    UNION ALL

    SELECT
      ua.user_id AS raw_user_id,
      NULL::text AS raw_email,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::timestamptz,
      ua.created_at,
      ua.created_at,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint,
      1::bigint
    FROM public.user_attempts ua
  ),
  email_to_user AS (
    SELECT raw_email, min(raw_user_id::text)::uuid AS mapped_user_id
    FROM raw_sources
    WHERE raw_email IS NOT NULL AND raw_user_id IS NOT NULL
    GROUP BY raw_email
  ),
  normalized AS (
    SELECT
      coalesce(rs.raw_user_id, em.mapped_user_id) AS normalized_user_id,
      rs.raw_email,
      rs.display_name,
      rs.avatar_url,
      rs.raw_role,
      rs.raw_vip_until,
      rs.source_created_at,
      rs.activity_at,
      rs.visitor_event_count,
      rs.forum_post_count,
      rs.forum_comment_count,
      rs.lesson_progress_count,
      rs.attempt_count
    FROM raw_sources rs
    LEFT JOIN email_to_user em ON em.raw_email = rs.raw_email
  )
  SELECT
    (CASE
      WHEN n.normalized_user_id IS NOT NULL THEN 'id:' || n.normalized_user_id::text
      ELSE 'email:' || n.raw_email
    END)::text AS user_key,
    n.normalized_user_id::uuid AS user_id,
    (min(n.raw_email) FILTER (WHERE n.raw_email IS NOT NULL))::text AS email,
    (max(n.display_name) FILTER (WHERE n.display_name IS NOT NULL))::text AS display_name,
    (max(n.avatar_url) FILTER (WHERE n.avatar_url IS NOT NULL))::text AS avatar_url,
    (CASE
      WHEN bool_or(n.raw_role = 'admin') THEN 'admin'
      ELSE coalesce(max(n.raw_role) FILTER (WHERE n.raw_role IS NOT NULL), 'unknown')
    END)::text AS role,
    max(n.raw_vip_until)::timestamptz AS vip_until,
    min(n.source_created_at)::timestamptz AS created_at,
    max(n.activity_at)::timestamptz AS last_activity_at,
    coalesce(sum(n.visitor_event_count), 0)::bigint AS visitor_event_count,
    coalesce(sum(n.forum_post_count), 0)::bigint AS forum_post_count,
    coalesce(sum(n.forum_comment_count), 0)::bigint AS forum_comment_count,
    coalesce(sum(n.lesson_progress_count), 0)::bigint AS lesson_progress_count,
    coalesce(sum(n.attempt_count), 0)::bigint AS attempt_count,
    bool_or(n.raw_role = 'admin')::boolean AS is_admin
  FROM normalized n
  WHERE n.normalized_user_id IS NOT NULL OR n.raw_email IS NOT NULL
  GROUP BY
    CASE
      WHEN n.normalized_user_id IS NOT NULL THEN 'id:' || n.normalized_user_id::text
      ELSE 'email:' || n.raw_email
    END,
    n.normalized_user_id
  ORDER BY max(n.activity_at) DESC NULLS LAST;
END;
$$;
