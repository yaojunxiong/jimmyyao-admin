import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'

async function readCleanupScript() {
  return readFile(
    path.join(process.cwd(), 'scripts/cleanup-forum-videos.mjs'),
    'utf8',
  )
}

describe('forum video cleanup process', () => {
  it('is dry-run by default and requires project plus maintenance confirmation', async () => {
    const script = await readCleanupScript()
    assert.match(script, /normalizeProjectUrl\(configuredUrl\)/)
    assert.match(script, /hostname\.split\('\.'\)\[0\]/)
    assert.match(script, /executeExpiredReservations \|\| executeFinalizedOrphans/)
    assert.match(script, /confirmProject !== projectRef/)
    assert.match(script, /Execution requires --confirm-writes-paused/)
    assert.match(script, /assertVideoWritesPaused/)
    assert.match(script, /forum_local_video_upload/)
    assert.match(script, /enabledFor\.includes\('admin'\)/)
    assert.match(script, /Dry run complete\. Nothing was deleted or updated\./)
    assert.doesNotMatch(script, /forum_rich_text/)
    assert.doesNotMatch(script, /const PROJECT_(?:REF|URL)/)
  })

  it('accepts only an exact configured hosted Supabase project origin', async () => {
    const script = await readCleanupScript()
    assert.match(script, /NEXT_PUBLIC_SUPABASE_URL/)
    assert.match(script, /\^https:\\\/\\\/\(/)
    assert.match(script, /\[a-z0-9\]\{20\}/)
    assert.match(script, /supabase/)
    assert.match(script, /rawUrl !== rawUrl\.trim\(\)/)
  })

  it('uses conservative grace periods and distinct cleanup modes', async () => {
    const script = await readCleanupScript()
    assert.match(script, /RESERVATION_GRACE_HOURS = 24/)
    assert.match(script, /FINALIZED_ORPHAN_GRACE_DAYS = 30/)
    assert.match(script, /--execute-expired-reservations/)
    assert.match(script, /--execute-finalized-orphans/)
    assert.match(script, /Run only one execute mode at a time/)
  })

  it('reference-checks HTML and TipTap JSON immediately before Storage removal', async () => {
    const script = await readCleanupScript()
    assert.match(script, /content_html,content_json/)
    assert.match(script, /findImmediateReference/)
    assert.match(script, /referenceTokens/)
    assert.match(script, /bucket\.remove\(\[objectPath\]\)/)
    assert.doesNotMatch(script, /delete\s+from\s+storage\.objects/i)
  })

  it('never prints the configured service-role credential', async () => {
    const script = await readCleanupScript()
    assert.match(script, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
    assert.doesNotMatch(script, /console\.(?:log|error)\([^\n]*serviceRoleKey/)
    assert.match(script, /Bearer \[redacted\]/)
  })
})
