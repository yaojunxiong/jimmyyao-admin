-- Forum rich-text support for admin-authored posts.
-- Scope: raster image uploads plus YouTube/Vimeo URL embeds.
-- Local video uploads are intentionally not supported.

-- -----------------------------------------------------------------------------
-- 1. Backward-compatible post columns and invariants
-- -----------------------------------------------------------------------------

ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS content_format text DEFAULT 'plain_text';

ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS content_json jsonb;

ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS content_html text;

ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS content_text text;

ALTER TABLE public.forum_posts
  ALTER COLUMN content_format SET DEFAULT 'plain_text',
  ALTER COLUMN content_format SET NOT NULL;

ALTER TABLE public.forum_posts
  DROP CONSTRAINT IF EXISTS forum_posts_content_format_check;

ALTER TABLE public.forum_posts
  ADD CONSTRAINT forum_posts_content_format_check
  CHECK (content_format IN ('plain_text', 'rich_text')) NOT VALID;

ALTER TABLE public.forum_posts
  VALIDATE CONSTRAINT forum_posts_content_format_check;

ALTER TABLE public.forum_posts
  DROP CONSTRAINT IF EXISTS forum_posts_content_html_size_check;

ALTER TABLE public.forum_posts
  ADD CONSTRAINT forum_posts_content_html_size_check
  CHECK (content_html IS NULL OR char_length(content_html) <= 250000) NOT VALID;

ALTER TABLE public.forum_posts
  VALIDATE CONSTRAINT forum_posts_content_html_size_check;

ALTER TABLE public.forum_posts
  DROP CONSTRAINT IF EXISTS forum_posts_content_text_size_check;

ALTER TABLE public.forum_posts
  ADD CONSTRAINT forum_posts_content_text_size_check
  CHECK (content_text IS NULL OR char_length(content_text) <= 12000) NOT VALID;

ALTER TABLE public.forum_posts
  VALIDATE CONSTRAINT forum_posts_content_text_size_check;

COMMENT ON COLUMN public.forum_posts.content_format IS
  'plain_text for legacy/member posts; rich_text for admin TipTap posts';
COMMENT ON COLUMN public.forum_posts.content_json IS
  'TipTap JSON for admin rich-text editing; null for plain-text posts';
COMMENT ON COLUMN public.forum_posts.content_html IS
  'Server-sanitized rich-text HTML; public renderers sanitize again';
COMMENT ON COLUMN public.forum_posts.content_text IS
  'Normalized text extracted server-side for fallback/search/moderation';

-- -----------------------------------------------------------------------------
-- 2. Admin-only create/update functions
-- -----------------------------------------------------------------------------
-- Privileged writes live in the unexposed private schema. Public RPC wrappers are
-- SECURITY INVOKER and are granted only to authenticated/service_role. Both the
-- API and the private functions independently verify the database admin role.
-- HTML is sanitized in the admin API and again in each renderer. PostgreSQL does
-- not attempt to parse HTML.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.admin_create_forum_post(
  p_title text,
  p_body text,
  p_category text,
  p_content_format text,
  p_content_json jsonb,
  p_content_html text,
  p_content_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_body text;
  v_category_id uuid;
  v_excerpt text;
  v_post_id uuid;
  v_slug text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_user_id
      AND ur.role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF p_title IS NULL
     OR char_length(btrim(p_title)) < 2
     OR char_length(btrim(p_title)) > 120 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_title');
  END IF;

  IF p_category IS NULL OR p_category NOT IN (
    'grammar', 'vocabulary', 'wrong_question', 'checkin', 'announcement'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_category');
  END IF;

  IF p_content_format IS NULL
     OR p_content_format NOT IN ('plain_text', 'rich_text') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_content_format');
  END IF;

  IF p_content_format = 'rich_text' THEN
    IF p_content_json IS NULL
       OR p_content_html IS NULL
       OR p_content_text IS NULL
       OR char_length(p_content_html) < 1
       OR char_length(p_content_html) > 250000
       OR char_length(p_content_text) < 1
       OR char_length(p_content_text) > 12000
       OR pg_column_size(p_content_json) > 1048576 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_rich_text');
    END IF;
  ELSIF p_body IS NULL OR char_length(p_body) < 1 OR char_length(p_body) > 12000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_body');
  END IF;

  v_body := CASE WHEN p_content_format = 'rich_text' THEN p_content_text ELSE p_body END;

  SELECT c.id
  INTO v_category_id
  FROM public.forum_categories c
  WHERE c.slug = CASE p_category
      WHEN 'grammar' THEN 'minna-no-nihongo'
      WHEN 'vocabulary' THEN 'learning-resources'
      WHEN 'wrong_question' THEN 'bug-feedback'
      WHEN 'checkin' THEN 'study-checkin'
      WHEN 'announcement' THEN 'feature-requests'
    END
    AND c.is_active = true
  LIMIT 1;

  IF v_category_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_category_mapping');
  END IF;

  v_slug := public.forum_unique_post_slug(btrim(p_title));
  v_excerpt := public.forum_make_excerpt(v_body);

  INSERT INTO public.forum_posts (
    author_user_id,
    author_email,
    title,
    body,
    category,
    category_id,
    status,
    slug,
    excerpt,
    is_official,
    content_format,
    content_json,
    content_html,
    content_text
  )
  VALUES (
    v_user_id,
    (SELECT u.email FROM auth.users u WHERE u.id = v_user_id),
    btrim(p_title),
    v_body,
    p_category,
    v_category_id,
    'approved',
    v_slug,
    v_excerpt,
    true,
    p_content_format,
    CASE WHEN p_content_format = 'rich_text' THEN p_content_json ELSE NULL END,
    CASE WHEN p_content_format = 'rich_text' THEN p_content_html ELSE NULL END,
    CASE WHEN p_content_format = 'rich_text' THEN p_content_text ELSE NULL END
  )
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object('success', true, 'post_id', v_post_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_forum_post(
  p_title text,
  p_body text,
  p_category text,
  p_content_format text,
  p_content_json jsonb,
  p_content_html text,
  p_content_text text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_create_forum_post($1, $2, $3, $4, $5, $6, $7);
$$;

REVOKE ALL ON FUNCTION private.admin_create_forum_post(
  text, text, text, text, jsonb, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_create_forum_post(
  text, text, text, text, jsonb, text, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_create_forum_post(
  text, text, text, text, jsonb, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_forum_post(
  text, text, text, text, jsonb, text, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.admin_update_forum_post(
  p_post_id uuid,
  p_title text,
  p_body text,
  p_category text,
  p_content_format text,
  p_content_json jsonb,
  p_content_html text,
  p_content_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_body text;
  v_category_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_user_id
      AND ur.role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.forum_posts p WHERE p.id = p_post_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'post_not_found');
  END IF;

  IF p_title IS NULL
     OR char_length(btrim(p_title)) < 2
     OR char_length(btrim(p_title)) > 120 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_title');
  END IF;

  IF p_category IS NULL OR p_category NOT IN (
    'grammar', 'vocabulary', 'wrong_question', 'checkin', 'announcement'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_category');
  END IF;

  IF p_content_format IS NULL
     OR p_content_format NOT IN ('plain_text', 'rich_text') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_content_format');
  END IF;

  IF p_content_format = 'rich_text' THEN
    IF p_content_json IS NULL
       OR p_content_html IS NULL
       OR p_content_text IS NULL
       OR char_length(p_content_html) < 1
       OR char_length(p_content_html) > 250000
       OR char_length(p_content_text) < 1
       OR char_length(p_content_text) > 12000
       OR pg_column_size(p_content_json) > 1048576 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_rich_text');
    END IF;
  ELSIF p_body IS NULL OR char_length(p_body) < 1 OR char_length(p_body) > 12000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_body');
  END IF;

  v_body := CASE WHEN p_content_format = 'rich_text' THEN p_content_text ELSE p_body END;

  SELECT c.id
  INTO v_category_id
  FROM public.forum_categories c
  WHERE c.slug = CASE p_category
      WHEN 'grammar' THEN 'minna-no-nihongo'
      WHEN 'vocabulary' THEN 'learning-resources'
      WHEN 'wrong_question' THEN 'bug-feedback'
      WHEN 'checkin' THEN 'study-checkin'
      WHEN 'announcement' THEN 'feature-requests'
    END
    AND c.is_active = true
  LIMIT 1;

  IF v_category_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_category_mapping');
  END IF;

  UPDATE public.forum_posts
  SET title = btrim(p_title),
      body = v_body,
      category = p_category,
      category_id = v_category_id,
      excerpt = public.forum_make_excerpt(v_body),
      content_format = p_content_format,
      content_json = CASE WHEN p_content_format = 'rich_text' THEN p_content_json ELSE NULL END,
      content_html = CASE WHEN p_content_format = 'rich_text' THEN p_content_html ELSE NULL END,
      content_text = CASE WHEN p_content_format = 'rich_text' THEN p_content_text ELSE NULL END,
      updated_at = now()
  WHERE id = p_post_id;

  RETURN jsonb_build_object('success', true, 'post_id', p_post_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_forum_post(
  p_post_id uuid,
  p_title text,
  p_body text,
  p_category text,
  p_content_format text,
  p_content_json jsonb,
  p_content_html text,
  p_content_text text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_update_forum_post($1, $2, $3, $4, $5, $6, $7, $8);
$$;

REVOKE ALL ON FUNCTION private.admin_update_forum_post(
  uuid, text, text, text, text, jsonb, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_update_forum_post(
  uuid, text, text, text, text, jsonb, text, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_update_forum_post(
  uuid, text, text, text, text, jsonb, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_forum_post(
  uuid, text, text, text, text, jsonb, text, text
) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Public image delivery with admin-only object writes
-- -----------------------------------------------------------------------------
-- The bucket is public because post HTML stores durable public URLs. Object
-- listing/upload/update/delete still goes through RLS and is admin-only. Images
-- uploaded by an admin are therefore public assets even before a post uses them;
-- do not upload sensitive media to this bucket.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'forum-media',
  'forum-media',
  true,
  4194304,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "forum_media_select_public" ON storage.objects;
DROP POLICY IF EXISTS "forum_media_select_admin" ON storage.objects;
DROP POLICY IF EXISTS "forum_media_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "forum_media_update_admin" ON storage.objects;
DROP POLICY IF EXISTS "forum_media_delete_admin" ON storage.objects;

CREATE POLICY "forum_media_select_admin"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'forum-media'
  AND (SELECT private.forum_is_admin())
);

CREATE POLICY "forum_media_insert_admin"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'forum-media'
  AND (SELECT private.forum_is_admin())
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'gif', 'webp')
);

CREATE POLICY "forum_media_update_admin"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'forum-media'
  AND (SELECT private.forum_is_admin())
)
WITH CHECK (
  bucket_id = 'forum-media'
  AND (SELECT private.forum_is_admin())
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'gif', 'webp')
);

CREATE POLICY "forum_media_delete_admin"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'forum-media'
  AND (SELECT private.forum_is_admin())
);

-- -----------------------------------------------------------------------------
-- 4. Admin-only feature flag
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.feature_flags FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.feature_flags TO authenticated;
GRANT ALL ON TABLE public.feature_flags TO service_role;

DROP POLICY IF EXISTS "feature_flags_select_admin" ON public.feature_flags;
DROP POLICY IF EXISTS "feature_flags_insert_admin" ON public.feature_flags;
DROP POLICY IF EXISTS "feature_flags_update_admin" ON public.feature_flags;

CREATE POLICY "feature_flags_select_admin"
ON public.feature_flags
FOR SELECT
TO authenticated
USING ((SELECT private.forum_is_admin()));

CREATE POLICY "feature_flags_insert_admin"
ON public.feature_flags
FOR INSERT
TO authenticated
WITH CHECK ((SELECT private.forum_is_admin()));

CREATE POLICY "feature_flags_update_admin"
ON public.feature_flags
FOR UPDATE
TO authenticated
USING ((SELECT private.forum_is_admin()))
WITH CHECK ((SELECT private.forum_is_admin()));

INSERT INTO public.feature_flags (key, value, description)
VALUES (
  'forum_rich_text',
  '{"enabled_for":["admin"]}'::jsonb,
  'Admin-only TipTap editing with raster image uploads and YouTube/Vimeo URL embeds; no local video uploads.'
)
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Approved-only public view
-- -----------------------------------------------------------------------------
-- Existing column names/order and profile fields are preserved verbatim; the
-- three public rich-text fields are appended so CREATE OR REPLACE is replay-safe.

CREATE OR REPLACE VIEW public.forum_posts_public
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  p.id,
  p.category_id,
  p.title,
  p.slug,
  p.excerpt,
  p.body,
  p.category,
  p.comment_count,
  p.view_count,
  p.like_count,
  p.bookmark_count,
  p.reaction_count,
  p.is_pinned,
  p.is_official,
  p.created_at,
  p.updated_at,
  p.author_user_id,
  pr.display_name,
  pr.avatar_url,
  p.content_format,
  p.content_html,
  p.content_text
FROM public.forum_posts p
LEFT JOIN public.profiles pr ON pr.id = p.author_user_id
WHERE p.status IN ('approved', '已通过')
  AND COALESCE(p.is_deleted, false) = false;

REVOKE ALL ON public.forum_posts_public FROM PUBLIC;
GRANT SELECT ON public.forum_posts_public TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
