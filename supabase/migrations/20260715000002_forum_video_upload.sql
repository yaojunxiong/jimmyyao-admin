-- Forum local-video upload support for admin-authored rich-text posts.
--
-- Architecture:
--   * The browser uploads directly to a short-lived signed Storage URL.
--   * New bytes first land at reservations/{admin}/{yyyy}/{mm}/{uuid}.{ext}.
--   * The admin API verifies size, MIME metadata, and a byte-range signature.
--   * Storage then moves the object to the immutable videos/... path.
--   * Only a finalized tracking row may be referenced by a forum post.
--
-- This migration is intentionally separate from 20260715000001. It is safe to
-- rerun: tables/columns/indexes use IF NOT EXISTS, functions use OR REPLACE,
-- bucket configuration is upserted, and every policy/trigger is dropped before
-- recreation. It does not delete posts, tracking rows, buckets, or media.

-- -----------------------------------------------------------------------------
-- 1. Stable public playback bucket
-- -----------------------------------------------------------------------------
-- Public means an exact final URL can be played by anonymous forum readers.
-- Public buckets do not require an object SELECT policy for public URL serving;
-- omitting such a policy also avoids granting anonymous object listing/info.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'forum-videos',
  'forum-videos',
  true,
  52428800,
  ARRAY['video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- 2. Reservation/finalization tracking
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.forum_video_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  upload_path text NOT NULL,
  object_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + INTERVAL '2 hours',
  finalized_at timestamptz,
  deleted_at timestamptz
);

ALTER TABLE public.forum_video_uploads
  ADD COLUMN IF NOT EXISTS upload_path text,
  ADD COLUMN IF NOT EXISTS object_path text,
  ADD COLUMN IF NOT EXISTS original_name text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.forum_video_uploads
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN admin_id SET NOT NULL,
  ALTER COLUMN upload_path SET NOT NULL,
  ALTER COLUMN object_path SET NOT NULL,
  ALTER COLUMN original_name SET NOT NULL,
  ALTER COLUMN mime_type SET NOT NULL,
  ALTER COLUMN file_size TYPE bigint USING file_size::bigint,
  ALTER COLUMN file_size SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'reserved',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN expires_at SET DEFAULT now() + INTERVAL '2 hours',
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE public.forum_video_uploads
  DROP CONSTRAINT IF EXISTS forum_video_uploads_status_check,
  DROP CONSTRAINT IF EXISTS forum_video_uploads_mime_type_check,
  DROP CONSTRAINT IF EXISTS forum_video_uploads_file_size_check,
  DROP CONSTRAINT IF EXISTS forum_video_uploads_original_name_check,
  DROP CONSTRAINT IF EXISTS forum_video_uploads_paths_check,
  DROP CONSTRAINT IF EXISTS forum_video_uploads_timestamps_check;

ALTER TABLE public.forum_video_uploads
  ADD CONSTRAINT forum_video_uploads_status_check
    CHECK (status IN ('reserved', 'finalized', 'deleted')) NOT VALID,
  ADD CONSTRAINT forum_video_uploads_mime_type_check
    CHECK (mime_type IN ('video/mp4', 'video/webm')) NOT VALID,
  ADD CONSTRAINT forum_video_uploads_file_size_check
    CHECK (file_size BETWEEN 1 AND 52428800) NOT VALID,
  ADD CONSTRAINT forum_video_uploads_original_name_check
    CHECK (
      char_length(original_name) BETWEEN 1 AND 255
      AND original_name = btrim(original_name)
      AND position('/' IN original_name) = 0
      AND position(chr(92) IN original_name) = 0
      AND original_name !~ '[[:cntrl:]]'
      AND (
        (mime_type = 'video/mp4' AND lower(original_name) ~ '[.]mp4$')
        OR (mime_type = 'video/webm' AND lower(original_name) ~ '[.]webm$')
      )
    ) NOT VALID,
  ADD CONSTRAINT forum_video_uploads_paths_check
    CHECK (
      upload_path ~ '^reservations/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](mp4|webm)$'
      AND split_part(upload_path, '/', 2) = admin_id::text
      AND object_path = 'videos/' || substr(upload_path, length('reservations/') + 1)
      AND (
        (mime_type = 'video/mp4' AND right(upload_path, 4) = '.mp4')
        OR (mime_type = 'video/webm' AND right(upload_path, 5) = '.webm')
      )
    ) NOT VALID,
  ADD CONSTRAINT forum_video_uploads_timestamps_check
    CHECK (
      expires_at > created_at
      AND (finalized_at IS NULL OR finalized_at >= created_at)
      AND (deleted_at IS NULL OR deleted_at >= created_at)
      AND (status <> 'finalized' OR finalized_at IS NOT NULL)
      AND (status <> 'reserved' OR finalized_at IS NULL)
      AND ((status = 'deleted') = (deleted_at IS NOT NULL))
    ) NOT VALID;

ALTER TABLE public.forum_video_uploads
  VALIDATE CONSTRAINT forum_video_uploads_status_check,
  VALIDATE CONSTRAINT forum_video_uploads_mime_type_check,
  VALIDATE CONSTRAINT forum_video_uploads_file_size_check,
  VALIDATE CONSTRAINT forum_video_uploads_original_name_check,
  VALIDATE CONSTRAINT forum_video_uploads_paths_check,
  VALIDATE CONSTRAINT forum_video_uploads_timestamps_check;

CREATE UNIQUE INDEX IF NOT EXISTS forum_video_uploads_upload_path_key
  ON public.forum_video_uploads(upload_path);

CREATE UNIQUE INDEX IF NOT EXISTS forum_video_uploads_object_path_key
  ON public.forum_video_uploads(object_path);

CREATE INDEX IF NOT EXISTS forum_video_uploads_admin_created_idx
  ON public.forum_video_uploads(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS forum_video_uploads_reserved_expiry_idx
  ON public.forum_video_uploads(expires_at)
  WHERE status = 'reserved';

COMMENT ON TABLE public.forum_video_uploads IS
  'Admin local-video reservations; only finalized object paths may be stored in forum posts';
COMMENT ON COLUMN public.forum_video_uploads.upload_path IS
  'Short-lived UUID reservation object path under reservations/';
COMMENT ON COLUMN public.forum_video_uploads.object_path IS
  'Immutable public playback path under videos/ after verification';
COMMENT ON COLUMN public.forum_video_uploads.expires_at IS
  'Reservation expiry, two hours after creation; cleanup applies a further grace period';

ALTER TABLE public.forum_video_uploads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.forum_video_uploads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.forum_video_uploads TO authenticated;
GRANT ALL ON TABLE public.forum_video_uploads TO service_role;

DROP POLICY IF EXISTS "forum_video_uploads_select_admin" ON public.forum_video_uploads;
DROP POLICY IF EXISTS "forum_video_uploads_insert_denied" ON public.forum_video_uploads;
DROP POLICY IF EXISTS "forum_video_uploads_update_denied" ON public.forum_video_uploads;
DROP POLICY IF EXISTS "forum_video_uploads_delete_denied" ON public.forum_video_uploads;

CREATE POLICY "forum_video_uploads_select_admin"
ON public.forum_video_uploads
FOR SELECT
TO authenticated
USING (
  (SELECT private.forum_is_admin())
);

-- Authenticated callers deliberately receive no table mutation privilege.
-- These explicit deny policies document and preserve that boundary even if a
-- future grant is broadened accidentally. Mutations occur only in the checked
-- SECURITY DEFINER functions below; service_role bypasses RLS for cleanup.
CREATE POLICY "forum_video_uploads_insert_denied"
ON public.forum_video_uploads
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "forum_video_uploads_update_denied"
ON public.forum_video_uploads
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "forum_video_uploads_delete_denied"
ON public.forum_video_uploads
FOR DELETE
TO authenticated
USING (false);

-- -----------------------------------------------------------------------------
-- 3. Internally authorized reservation/finalization RPCs
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;

-- Local-video rollout is independent from the existing rich-text rollout.
-- Reapplying this migration deliberately returns only this video capability to
-- its safe disabled state; forum_rich_text is never read or modified here.
INSERT INTO public.feature_flags (key, value, description)
VALUES (
  'forum_local_video_upload',
  '{"enabled_for":[]}'::jsonb,
  'Admin-only direct local MP4/WebM uploads (50 MB; 3 per post). Rich text, images, and YouTube/Vimeo use separate controls.'
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = now();

-- Derive the exact hosted project origin from the authenticated JWT issuer.
-- There is no fallback: missing, legacy, malformed, HTTP, path-extended, or
-- attacker-controlled issuers produce NULL and local-video post validation
-- fails closed. On the shared project this resolves to
-- https://ycjuceortcduakxscfes.supabase.co; alternate hosted project refs work
-- for isolated non-production validation.
CREATE OR REPLACE FUNCTION private.forum_video_storage_origin()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN COALESCE(auth.jwt() ->> 'iss', '')
      ~ '^https://[a-z0-9]{20}[.]supabase[.]co/auth/v1$'
    THEN pg_catalog.regexp_replace(
      auth.jwt() ->> 'iss',
      '/auth/v1$',
      ''
    )
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION private.forum_video_storage_origin()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.admin_reserve_forum_video(
  p_upload_path text,
  p_object_path text,
  p_original_name text,
  p_mime_type text,
  p_file_size bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_reservation_id uuid;
  v_expires_at timestamptz;
  v_recent_count bigint;
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.feature_flags ff
    WHERE ff.key = 'forum_local_video_upload'
      AND pg_catalog.jsonb_typeof(ff.value -> 'enabled_for') = 'array'
      AND (ff.value -> 'enabled_for') @> '["admin"]'::jsonb
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'feature_disabled');
  END IF;

  IF p_mime_type IS NULL
     OR p_mime_type NOT IN ('video/mp4', 'video/webm')
     OR p_file_size IS NULL
     OR p_file_size < 1
     OR p_file_size > 52428800
     OR p_original_name IS NULL
     OR char_length(p_original_name) NOT BETWEEN 1 AND 255
     OR p_original_name <> btrim(p_original_name)
     OR position('/' IN p_original_name) > 0
     OR position(chr(92) IN p_original_name) > 0
     OR p_original_name ~ '[[:cntrl:]]'
     OR (p_mime_type = 'video/mp4' AND lower(p_original_name) !~ '[.]mp4$')
     OR (p_mime_type = 'video/webm' AND lower(p_original_name) !~ '[.]webm$') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_file');
  END IF;

  IF p_upload_path IS NULL
     OR p_object_path IS NULL
     OR p_upload_path !~ '^reservations/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](mp4|webm)$'
     OR split_part(p_upload_path, '/', 2) <> v_user_id::text
     OR p_object_path <> 'videos/' || substr(p_upload_path, length('reservations/') + 1)
     OR (p_mime_type = 'video/mp4' AND right(p_upload_path, 4) <> '.mp4')
     OR (p_mime_type = 'video/webm' AND right(p_upload_path, 5) <> '.webm') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_path');
  END IF;

  -- The advisory transaction lock serializes the count and insert per admin.
  -- The API also performs an exact, fail-closed count for a useful status, but
  -- this lock is the authoritative protection against concurrent reservations.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  SELECT count(*)
  INTO v_recent_count
  FROM public.forum_video_uploads fvu
  WHERE fvu.admin_id = v_user_id
    AND fvu.created_at >= v_now - INTERVAL '1 hour';

  IF v_recent_count >= 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'rate_limited');
  END IF;

  v_expires_at := v_now + INTERVAL '2 hours';

  INSERT INTO public.forum_video_uploads (
    admin_id,
    upload_path,
    object_path,
    original_name,
    mime_type,
    file_size,
    status,
    created_at,
    expires_at
  )
  VALUES (
    v_user_id,
    p_upload_path,
    p_object_path,
    p_original_name,
    p_mime_type,
    p_file_size,
    'reserved',
    v_now,
    v_expires_at
  )
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'expires_at', v_expires_at
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'path_conflict');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reserve_forum_video(
  p_upload_path text,
  p_object_path text,
  p_original_name text,
  p_mime_type text,
  p_file_size bigint
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_reserve_forum_video($1, $2, $3, $4, $5);
$$;

REVOKE ALL ON FUNCTION private.admin_reserve_forum_video(
  text, text, text, text, bigint
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_reserve_forum_video(
  text, text, text, text, bigint
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_reserve_forum_video(
  text, text, text, text, bigint
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reserve_forum_video(
  text, text, text, text, bigint
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.admin_finalize_forum_video(
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_upload public.forum_video_uploads%ROWTYPE;
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.feature_flags ff
    WHERE ff.key = 'forum_local_video_upload'
      AND pg_catalog.jsonb_typeof(ff.value -> 'enabled_for') = 'array'
      AND (ff.value -> 'enabled_for') @> '["admin"]'::jsonb
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'feature_disabled');
  END IF;

  SELECT fvu.*
  INTO v_upload
  FROM public.forum_video_uploads fvu
  WHERE fvu.id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'reservation_not_found');
  END IF;

  IF v_upload.admin_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF v_upload.status = 'finalized' AND v_upload.finalized_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_finalized', true);
  END IF;

  IF v_upload.status <> 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  -- The API has already checked a Range signature. The database independently
  -- requires the exact moved object and matching immutable Storage metadata.
  -- A valid final object may be reconciled after expiry because Storage move
  -- itself was allowed only while the reservation was live. This closes the
  -- narrow move-before-expiry / RPC-after-expiry partial-finalization window.
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects so
    WHERE so.bucket_id = 'forum-videos'
      AND so.name = v_upload.object_path
      AND so.owner_id = v_upload.admin_id::text
      AND COALESCE(so.metadata ->> 'mimetype', '') = v_upload.mime_type
      AND CASE
        WHEN COALESCE(so.metadata ->> 'size', '') ~ '^[0-9]+$'
          THEN (so.metadata ->> 'size')::bigint = v_upload.file_size
        ELSE false
      END
  ) THEN
    IF v_upload.expires_at <= v_now THEN
      RETURN jsonb_build_object('success', false, 'error', 'reservation_expired');
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'storage_object_invalid');
  END IF;

  UPDATE public.forum_video_uploads
  SET status = 'finalized',
      finalized_at = v_now
  WHERE id = v_upload.id;

  RETURN jsonb_build_object('success', true, 'already_finalized', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_finalize_forum_video(
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_finalize_forum_video($1);
$$;

REVOKE ALL ON FUNCTION private.admin_finalize_forum_video(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_finalize_forum_video(uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_finalize_forum_video(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_finalize_forum_video(uuid)
  TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Narrow Storage mutation policies
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "forum_videos_select_public" ON storage.objects;
DROP POLICY IF EXISTS "forum_videos_select_admin" ON storage.objects;
DROP POLICY IF EXISTS "forum_videos_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "forum_videos_update_admin" ON storage.objects;
DROP POLICY IF EXISTS "forum_videos_delete_admin" ON storage.objects;
DROP POLICY IF EXISTS "forum_videos_delete_denied" ON storage.objects;

CREATE POLICY "forum_videos_select_admin"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'forum-videos'
  AND owner_id = (SELECT auth.uid())::text
  AND (SELECT private.forum_is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.forum_video_uploads fvu
    WHERE fvu.admin_id = (SELECT auth.uid())
      AND (
        (
          fvu.status = 'reserved'
          AND fvu.upload_path = storage.objects.name
        )
        OR (
          fvu.status IN ('reserved', 'finalized')
          AND fvu.object_path = storage.objects.name
        )
      )
  )
);

CREATE POLICY "forum_videos_insert_admin"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'forum-videos'
  AND owner_id = (SELECT auth.uid())::text
  AND (SELECT private.forum_is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.feature_flags ff
    WHERE ff.key = 'forum_local_video_upload'
      AND pg_catalog.jsonb_typeof(ff.value -> 'enabled_for') = 'array'
      AND (ff.value -> 'enabled_for') @> '["admin"]'::jsonb
  )
  AND EXISTS (
    SELECT 1
    FROM public.forum_video_uploads fvu
    WHERE fvu.admin_id = (SELECT auth.uid())
      AND fvu.status = 'reserved'
      AND fvu.expires_at > (SELECT now())
      AND fvu.upload_path = storage.objects.name
      AND (
        (fvu.mime_type = 'video/mp4' AND right(storage.objects.name, 4) = '.mp4')
        OR (fvu.mime_type = 'video/webm' AND right(storage.objects.name, 5) = '.webm')
      )
  )
);

-- Storage move is an UPDATE: USING constrains the existing reservation object,
-- and WITH CHECK constrains the exact final destination for the same live row.
CREATE POLICY "forum_videos_update_admin"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'forum-videos'
  AND owner_id = (SELECT auth.uid())::text
  AND (SELECT private.forum_is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.feature_flags ff
    WHERE ff.key = 'forum_local_video_upload'
      AND pg_catalog.jsonb_typeof(ff.value -> 'enabled_for') = 'array'
      AND (ff.value -> 'enabled_for') @> '["admin"]'::jsonb
  )
  AND EXISTS (
    SELECT 1
    FROM public.forum_video_uploads fvu
    WHERE fvu.admin_id = (SELECT auth.uid())
      AND fvu.status = 'reserved'
      AND fvu.expires_at > (SELECT now())
      AND fvu.upload_path = storage.objects.name
  )
)
WITH CHECK (
  bucket_id = 'forum-videos'
  AND owner_id = (SELECT auth.uid())::text
  AND (SELECT private.forum_is_admin())
  AND EXISTS (
    SELECT 1
    FROM public.feature_flags ff
    WHERE ff.key = 'forum_local_video_upload'
      AND pg_catalog.jsonb_typeof(ff.value -> 'enabled_for') = 'array'
      AND (ff.value -> 'enabled_for') @> '["admin"]'::jsonb
  )
  AND EXISTS (
    SELECT 1
    FROM public.forum_video_uploads fvu
    WHERE fvu.admin_id = (SELECT auth.uid())
      AND fvu.status = 'reserved'
      AND fvu.expires_at > (SELECT now())
      AND fvu.object_path = storage.objects.name
  )
);

-- Admin sessions never delete forum videos. The reference-checked operator
-- cleanup process uses service_role and the Storage API.
CREATE POLICY "forum_videos_delete_denied"
ON storage.objects
FOR DELETE
TO authenticated
USING (false);

-- -----------------------------------------------------------------------------
-- 5. Database defense: posts may reference only finalized local videos
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.validate_forum_post_local_videos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_origin text := private.forum_video_storage_origin();
  v_video_feature_enabled boolean;
  v_caller_is_admin boolean;
  v_node jsonb;
  v_url text;
  v_mime text;
  v_path text;
  v_match text[];
  v_html_match text[];
  v_html_tag text;
  v_json_count integer := 0;
  v_html_count integer := 0;
  v_new_refs text[] := ARRAY[]::text[];
  v_old_refs text[] := ARRAY[]::text[];
BEGIN
  IF NEW.content_format IS DISTINCT FROM 'rich_text' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.feature_flags ff
    WHERE ff.key = 'forum_local_video_upload'
      AND pg_catalog.jsonb_typeof(ff.value -> 'enabled_for') = 'array'
      AND (ff.value -> 'enabled_for') @> '["admin"]'::jsonb
  )
  INTO v_video_feature_enabled;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
  )
  INTO v_caller_is_admin;

  IF position(
    '/storage/v1/object/public/forum-videos/reservations/'
    IN COALESCE(NEW.content_html, '')
  ) > 0
  OR position(
    '/storage/v1/object/public/forum-videos/reservations/'
    IN COALESCE(NEW.content_json::text, '')
  ) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'forum post references a temporary local video reservation';
  END IF;

  FOR v_node IN
    WITH RECURSIVE tiptap_nodes(node) AS (
      SELECT NEW.content_json
      UNION ALL
      SELECT child.value
      FROM tiptap_nodes parent
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
        CASE
          WHEN pg_catalog.jsonb_typeof(parent.node -> 'content') = 'array'
            THEN parent.node -> 'content'
          ELSE '[]'::jsonb
        END
      ) child(value)
    )
    SELECT node
    FROM tiptap_nodes
    WHERE node ->> 'type' = 'localVideo'
  LOOP
    v_json_count := v_json_count + 1;
    IF v_json_count > 3 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'forum post contains more than three local videos';
    END IF;

    v_url := v_node #>> '{attrs,src}';
    v_mime := v_node #>> '{attrs,mimeType}';
    v_match := pg_catalog.regexp_match(
      COALESCE(v_url, ''),
      '^(https://[a-z0-9]{20}[.]supabase[.]co)/storage/v1/object/public/forum-videos/(videos/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](mp4|webm))$'
    );
    IF v_match IS NULL
       OR v_origin IS NULL
       OR v_match[1] IS DISTINCT FROM v_origin THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'forum post contains a local video URL outside the configured Storage origin';
    END IF;

    v_path := v_match[2];
    IF (v_match[4] = 'mp4' AND v_mime <> 'video/mp4')
       OR (v_match[4] = 'webm' AND v_mime <> 'video/webm') THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'forum post local video MIME does not match its path';
    END IF;

    v_new_refs := pg_catalog.array_append(v_new_refs, 'json:' || v_path);

    IF NOT EXISTS (
      SELECT 1
      FROM public.forum_video_uploads fvu
      WHERE fvu.object_path = v_path
        AND fvu.mime_type = v_mime
        AND fvu.status = 'finalized'
        AND fvu.finalized_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'forum post references an unfinalized local video';
    END IF;
  END LOOP;

  -- Direct RPC callers must supply the exact canonical opening tag emitted by
  -- the server sanitizer. This rejects every other <video> origin, path,
  -- attribute set, query string, autoplay attempt, or temporary reservation.
  -- The admin API additionally requires exact JSON/HTML multiset equality.
  FOR v_html_match IN
    SELECT matches
    FROM pg_catalog.regexp_matches(
      COALESCE(NEW.content_html, ''),
      '(<video>|<video[[:space:]/][^>]*>)',
      'gi'
    ) matches
  LOOP
    v_html_count := v_html_count + 1;
    IF v_html_count > 3 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'forum post HTML contains more than three local videos';
    END IF;

    v_html_tag := v_html_match[1];
    v_match := pg_catalog.regexp_match(
      v_html_tag,
      '^<video src="(https://[a-z0-9]{20}[.]supabase[.]co)/storage/v1/object/public/forum-videos/(videos/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](mp4|webm))" controls="" preload="metadata" playsinline="" data-forum-video="" class="forum-local-video">$'
    );
    IF v_match IS NULL
       OR v_origin IS NULL
       OR v_match[1] IS DISTINCT FROM v_origin THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'forum post HTML contains a noncanonical local video';
    END IF;

    v_path := v_match[2];
    v_new_refs := pg_catalog.array_append(v_new_refs, 'html:' || v_path);
    IF NOT EXISTS (
      SELECT 1
      FROM public.forum_video_uploads fvu
      WHERE fvu.object_path = v_path
        AND fvu.status = 'finalized'
        AND fvu.finalized_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'forum post HTML references an unfinalized local video';
    END IF;
  END LOOP;

  IF pg_catalog.cardinality(v_new_refs) > 0
     AND NOT v_caller_is_admin THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only administrators may reference local forum videos';
  END IF;

  -- With the independent video flag disabled, an INSERT cannot introduce any
  -- local-video reference. An UPDATE may keep or remove an existing reference
  -- so already-published videos remain editable/readable, but each JSON/HTML
  -- path is compared as a multiset and no path may be added or duplicated.
  IF NOT v_video_feature_enabled
     AND pg_catalog.cardinality(v_new_refs) > 0 THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'local video upload feature is disabled';
    END IF;

    IF OLD.content_format IS NOT DISTINCT FROM 'rich_text' THEN
      FOR v_node IN
        WITH RECURSIVE tiptap_nodes(node) AS (
          SELECT OLD.content_json
          UNION ALL
          SELECT child.value
          FROM tiptap_nodes parent
          CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
            CASE
              WHEN pg_catalog.jsonb_typeof(parent.node -> 'content') = 'array'
                THEN parent.node -> 'content'
              ELSE '[]'::jsonb
            END
          ) child(value)
        )
        SELECT node
        FROM tiptap_nodes
        WHERE node ->> 'type' = 'localVideo'
      LOOP
        v_match := pg_catalog.regexp_match(
          COALESCE(v_node #>> '{attrs,src}', ''),
          '^(https://[a-z0-9]{20}[.]supabase[.]co)/storage/v1/object/public/forum-videos/(videos/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](mp4|webm))$'
        );
        IF v_match IS NOT NULL
           AND v_match[1] IS NOT DISTINCT FROM v_origin THEN
          v_old_refs := pg_catalog.array_append(
            v_old_refs,
            'json:' || v_match[2]
          );
        END IF;
      END LOOP;

      FOR v_html_match IN
        SELECT matches
        FROM pg_catalog.regexp_matches(
          COALESCE(OLD.content_html, ''),
          '(<video>|<video[[:space:]/][^>]*>)',
          'gi'
        ) matches
      LOOP
        v_match := pg_catalog.regexp_match(
          v_html_match[1],
          'src="(https://[a-z0-9]{20}[.]supabase[.]co)/storage/v1/object/public/forum-videos/(videos/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](mp4|webm))"'
        );
        IF v_match IS NOT NULL
           AND v_match[1] IS NOT DISTINCT FROM v_origin THEN
          v_old_refs := pg_catalog.array_append(
            v_old_refs,
            'html:' || v_match[2]
          );
        END IF;
      END LOOP;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM (
        SELECT new_ref.ref, count(*) AS ref_count
        FROM pg_catalog.unnest(v_new_refs) AS new_ref(ref)
        GROUP BY new_ref.ref
      ) new_counts
      LEFT JOIN (
        SELECT old_ref.ref, count(*) AS ref_count
        FROM pg_catalog.unnest(v_old_refs) AS old_ref(ref)
        GROUP BY old_ref.ref
      ) old_counts USING (ref)
      WHERE new_counts.ref_count > COALESCE(old_counts.ref_count, 0)
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'local video upload feature is disabled';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_forum_post_local_videos()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS validate_forum_post_local_videos
  ON public.forum_posts;

CREATE TRIGGER validate_forum_post_local_videos
BEFORE INSERT OR UPDATE OF content_format, content_json, content_html
ON public.forum_posts
FOR EACH ROW
EXECUTE FUNCTION private.validate_forum_post_local_videos();

-- Fail the migration if its independent rollout gate did not finish in the
-- disabled state. This verification intentionally does not read or update the
-- separate forum_rich_text flag.
DO $video_flag_verification$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.feature_flags ff
    WHERE ff.key = 'forum_local_video_upload'
      AND ff.value = '{"enabled_for":[]}'::jsonb
  ) THEN
    RAISE EXCEPTION 'forum_local_video_upload must be disabled after migration';
  END IF;
END;
$video_flag_verification$;

-- Optional read-only post-migration verification:
-- SELECT key, value
-- FROM public.feature_flags
-- WHERE key = 'forum_local_video_upload';
-- Expected: {"enabled_for": []}

-- -----------------------------------------------------------------------------
-- Rollback and orphan cleanup notes (manual; not executed by this migration)
-- -----------------------------------------------------------------------------
-- 1. Keep forum_local_video_upload at {"enabled_for":[]} before and during
--    cleanup, then wait at least two hours for signed authorizations and
--    reservations to expire. Ordinary rich text, images, and YouTube/Vimeo may
--    remain enabled because the database trigger independently rejects added
--    local-video references while this video flag is disabled.
--    A signed upload token issued before disablement cannot be revoked and may
--    still write temporary bytes until expiry; Storage move, finalization, and
--    post-reference gates remain closed.
-- 2. Run scripts/cleanup-forum-videos.mjs in dry-run mode. It reference-checks
--    forum_posts.content_html and content_json before using the Storage API.
-- 3. Do not DELETE FROM storage.objects. Do not remove the bucket while media
--    is referenced. A database rollback cannot restore deleted Storage bytes.
-- 4. After separately backing up and proving every object is orphaned, remove
--    objects through the Storage API. Only then may operators drop the trigger,
--    policies, wrappers/private functions (including
--    private.forum_video_storage_origin), tracking table, feature-flag row, and
--    empty bucket. Do not remove the flag/trigger before media cleanup finishes.
-- 5. The cleanup process applies a 24-hour post-expiry grace to reservations
--    and a 30-day/manual-review grace to finalized potential orphans.

-- Refresh the Data API schema cache for the new table and RPC wrappers.
NOTIFY pgrst, 'reload schema';
