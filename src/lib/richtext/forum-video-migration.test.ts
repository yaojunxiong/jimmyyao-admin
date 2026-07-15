import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260715000002_forum_video_upload.sql',
)

async function readMigration() {
  return readFile(migrationPath, 'utf8')
}

describe('forum local-video migration', () => {
  it('is rerunnable and does not contain destructive media/table operations', async () => {
    const sql = await readMigration()
    const executableSql = sql.replace(/--.*$/gm, '')
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.forum_video_uploads/i)
    assert.match(sql, /INSERT INTO storage\.buckets[\s\S]*ON CONFLICT/i)
    assert.doesNotMatch(executableSql, /\b(?:DROP TABLE|TRUNCATE)\b/i)
    assert.doesNotMatch(executableSql, /DELETE\s+FROM\s+storage\.objects/i)
    assert.doesNotMatch(executableSql, /DELETE\s+FROM\s+public\.forum_posts/i)

    const createdPolicies = Array.from(
      sql.matchAll(/CREATE POLICY\s+"([^"]+)"/gi),
      (match) => match[1],
    )
    assert.ok(createdPolicies.length >= 4)
    for (const policy of createdPolicies) {
      assert.match(
        sql,
        new RegExp(`DROP POLICY IF EXISTS\\s+"${policy}"`, 'i'),
        `policy ${policy} must be dropped before it is recreated`,
      )
    }
  })

  it('seeds only the independent local-video flag in a disabled state', async () => {
    const sql = await readMigration()
    const executableSql = sql.replace(/--.*$/gm, '')

    assert.match(
      sql,
      /INSERT INTO public\.feature_flags[\s\S]*'forum_local_video_upload'[\s\S]*'\{"enabled_for":\[\]\}'::jsonb[\s\S]*ON CONFLICT/,
    )
    assert.doesNotMatch(executableSql, /forum_rich_text/)
    assert.match(sql, /DO \$video_flag_verification\$/)
    assert.match(sql, /forum_local_video_upload must be disabled after migration/)
  })

  it('hardens the tracking table with RLS, explicit grants, and admin policies', async () => {
    const sql = await readMigration()
    assert.match(sql, /ALTER TABLE public\.forum_video_uploads ENABLE ROW LEVEL SECURITY/i)
    assert.match(sql, /REVOKE ALL ON TABLE public\.forum_video_uploads FROM PUBLIC, anon, authenticated/i)
    assert.match(sql, /GRANT SELECT ON TABLE public\.forum_video_uploads TO authenticated/i)
    assert.match(sql, /GRANT ALL ON TABLE public\.forum_video_uploads TO service_role/i)
    assert.match(sql, /public\.user_roles[\s\S]*role\s*=\s*'admin'/i)
    assert.match(sql, /admin_id\s*=\s*\(SELECT auth\.uid\(\)\)/i)
  })

  it('uses hardened definer functions and restricted RPC grants', async () => {
    const sql = await readMigration()
    const definerCount = (sql.match(/SECURITY DEFINER/gi) || []).length
    const emptySearchPathCount = (sql.match(/SET search_path\s*=\s*''/gi) || []).length
    assert.ok(definerCount >= 2)
    assert.ok(emptySearchPathCount >= definerCount)
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_reserve_forum_video[\s\S]*FROM PUBLIC, anon/i)
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_reserve_forum_video[\s\S]*TO authenticated, service_role/i)
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_finalize_forum_video[\s\S]*FROM PUBLIC, anon/i)
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_finalize_forum_video[\s\S]*TO authenticated, service_role/i)
  })

  it('independently gates reservation, finalization, and Storage mutation', async () => {
    const sql = await readMigration()
    const reserveStart = sql.indexOf(
      'CREATE OR REPLACE FUNCTION private.admin_reserve_forum_video',
    )
    const reserveEnd = sql.indexOf(
      'CREATE OR REPLACE FUNCTION public.admin_reserve_forum_video',
    )
    const finalizeStart = sql.indexOf(
      'CREATE OR REPLACE FUNCTION private.admin_finalize_forum_video',
    )
    const finalizeEnd = sql.indexOf(
      'CREATE OR REPLACE FUNCTION public.admin_finalize_forum_video',
      finalizeStart,
    )
    const insertPolicyStart = sql.indexOf('CREATE POLICY "forum_videos_insert_admin"')
    const deletePolicyStart = sql.indexOf('CREATE POLICY "forum_videos_delete_denied"')

    assert.ok(reserveStart >= 0 && reserveEnd > reserveStart)
    assert.ok(finalizeStart >= 0 && finalizeEnd > finalizeStart)
    assert.ok(insertPolicyStart >= 0 && deletePolicyStart > insertPolicyStart)

    const reserveBody = sql.slice(reserveStart, reserveEnd)
    const finalizeBody = sql.slice(finalizeStart, finalizeEnd)
    const storageMutationPolicies = sql.slice(insertPolicyStart, deletePolicyStart)
    for (const source of [reserveBody, finalizeBody, storageMutationPolicies]) {
      assert.match(source, /forum_local_video_upload/)
      assert.match(source, /enabled_for/)
      assert.match(source, /\["admin"\]/)
    }
    assert.match(reserveBody, /feature_disabled/)
    assert.match(finalizeBody, /feature_disabled/)
  })

  it('fails closed to the JWT-derived hosted project origin', async () => {
    const sql = await readMigration()
    assert.match(sql, /FUNCTION private\.forum_video_storage_origin\(\)/)
    assert.match(sql, /auth\.jwt\(\) ->> 'iss'/)
    assert.match(
      sql,
      /\^https:\/\/\[a-z0-9\]\{20\}\[\.\]supabase\[\.\]co\/auth\/v1\$/,
    )
    assert.match(sql, /ELSE NULL/)
    assert.match(sql, /v_origin IS NULL/)
    assert.match(sql, /v_match\[1\] IS DISTINCT FROM v_origin/)
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION private\.forum_video_storage_origin\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    )
  })

  it('blocks added references while disabled but permits preservation or removal', async () => {
    const sql = await readMigration()
    const triggerStart = sql.indexOf(
      'CREATE OR REPLACE FUNCTION private.validate_forum_post_local_videos',
    )
    const triggerEnd = sql.indexOf(
      'REVOKE ALL ON FUNCTION private.validate_forum_post_local_videos',
    )
    assert.ok(triggerStart >= 0 && triggerEnd > triggerStart)
    const triggerBody = sql.slice(triggerStart, triggerEnd)

    assert.match(triggerBody, /forum_local_video_upload/)
    assert.match(triggerBody, /v_new_refs/)
    assert.match(triggerBody, /v_old_refs/)
    assert.match(triggerBody, /v_caller_is_admin/)
    assert.match(triggerBody, /only administrators may reference local forum videos/)
    assert.match(triggerBody, /TG_OP = 'INSERT'/)
    assert.match(triggerBody, /OLD\.content_format IS NOT DISTINCT FROM 'rich_text'/)
    assert.match(triggerBody, /v_match\[1\] IS NOT DISTINCT FROM v_origin/)
    assert.match(triggerBody, /new_counts\.ref_count > COALESCE\(old_counts\.ref_count, 0\)/)
    assert.match(triggerBody, /local video upload feature is disabled/)
  })

  it('enforces the agreed limits, expiry, object paths, MIME types, and no overwrite', async () => {
    const sql = await readMigration()
    assert.match(sql, /52428800/)
    assert.match(sql, /video\/mp4/)
    assert.match(sql, /video\/webm/)
    assert.match(sql, /INTERVAL\s+'2 hours'/i)
    assert.match(sql, /INTERVAL\s+'1 hour'/i)
    assert.match(sql, />=\s*10/)
    assert.match(sql, /reservations\//)
    assert.match(sql, /videos\//)
    assert.match(sql, /status\s*=\s*'finalized'/i)
    assert.match(sql, /storage\.objects/i)
    assert.match(sql, /jsonb_typeof\(ff\.value -> 'enabled_for'\)\s*=\s*'array'/i)
    assert.match(sql, /WHEN COALESCE\(so\.metadata ->> 'size'/i)
    assert.match(sql, /noncanonical local video/i)
    assert.match(sql, /NOTIFY pgrst, 'reload schema'/i)
  })

  it('contains conservative rollback and orphan-cleanup notes without secrets', async () => {
    const sql = await readMigration()
    assert.match(sql, /rollback/i)
    assert.match(sql, /orphan/i)
    assert.match(sql, /Storage API/i)
    assert.doesNotMatch(sql, /service[_ -]?role[_ -]?(?:key|secret)\s*[:=]\s*['"][A-Za-z0-9._-]+/i)
  })
})
