#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

const VIDEO_BUCKET = 'forum-videos'

const RESERVATION_GRACE_HOURS = 24
const FINALIZED_ORPHAN_GRACE_DAYS = 30
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const POST_PAGE_SIZE = 500

const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const UUID_VALUE = new RegExp(`^${UUID}$`, 'i')
const VIDEO_SUFFIX =
  `${UUID}/[0-9]{4}/(?:0[1-9]|1[0-2])/${UUID}\\.(?:mp4|webm)`
const RESERVATION_PATH = new RegExp(`^reservations/${VIDEO_SUFFIX}$`)
const FINAL_PATH = new RegExp(`^videos/${VIDEO_SUFFIX}$`)

const TRACKING_COLUMNS =
  'id,admin_id,status,upload_path,object_path,created_at,expires_at,finalized_at,deleted_at'

function printHelp(projectRef = '<project-ref>', projectUrl = '<project-url>') {
  console.log(`Forum local-video cleanup (dry-run by default)

Usage:
  node scripts/cleanup-forum-videos.mjs [--limit=N]

  node scripts/cleanup-forum-videos.mjs \\
    --execute-expired-reservations \\
    --confirm-project=${projectRef} \\
    --confirm-writes-paused \\
    [--limit=N]

  node scripts/cleanup-forum-videos.mjs \\
    --execute-finalized-orphans \\
    --confirm-project=${projectRef} \\
    --confirm-writes-paused \\
    [--limit=N]

Required environment:
  SUPABASE_SERVICE_ROLE_KEY
  NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_URL must be an exact hosted Supabase project origin:
  ${projectUrl}

Safety:
  - With no execute flag, the script never modifies rows or Storage.
  - Only one execute mode can run at a time.
  - Execute mode requires the local-video feature flag to remain disabled.
  - Expired reservations receive an additional ${RESERVATION_GRACE_HOURS}-hour grace.
  - Finalized videos must be at least ${FINALIZED_ORPHAN_GRACE_DAYS} days old.
  - Paths are restricted to this feature's UUID-based prefixes.
  - Both content_html and content_json are rescanned immediately before removal.
  - Objects are removed one at a time through the Storage API.
`)
}

function parseArguments(argv, projectRef) {
  let limit = DEFAULT_LIMIT
  let confirmProject = ''
  let confirmWritesPaused = false
  let executeExpiredReservations = false
  let executeFinalizedOrphans = false

  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') return { help: true }
    if (argument === '--dry-run') continue

    if (argument === '--execute-expired-reservations') {
      executeExpiredReservations = true
      continue
    }
    if (argument === '--execute-finalized-orphans') {
      executeFinalizedOrphans = true
      continue
    }
    if (argument === '--confirm-writes-paused') {
      confirmWritesPaused = true
      continue
    }
    if (argument.startsWith('--confirm-project=')) {
      confirmProject = argument.slice('--confirm-project='.length)
      continue
    }
    if (argument.startsWith('--limit=')) {
      const value = Number(argument.slice('--limit='.length))
      if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIMIT) {
        throw new Error(`--limit must be an integer from 1 to ${MAX_LIMIT}`)
      }
      limit = value
      continue
    }

    throw new Error(`Unknown argument: ${argument}`)
  }

  if (executeExpiredReservations && executeFinalizedOrphans) {
    throw new Error('Run only one execute mode at a time')
  }

  const executes = executeExpiredReservations || executeFinalizedOrphans
  if (executes && confirmProject !== projectRef) {
    throw new Error(`Execution requires --confirm-project=${projectRef}`)
  }
  if (executes && !confirmWritesPaused) {
    throw new Error('Execution requires --confirm-writes-paused')
  }
  if (!executes && (confirmProject || confirmWritesPaused)) {
    throw new Error('Execution confirmations are only valid with an execute flag')
  }

  return {
    help: false,
    limit,
    executeExpiredReservations,
    executeFinalizedOrphans,
  }
}

async function assertVideoWritesPaused(supabase) {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('value')
    .eq('key', 'forum_local_video_upload')
    .maybeSingle()

  if (error || !data || !data.value || typeof data.value !== 'object') {
    throw new Error('Could not verify that local-video uploads are paused')
  }

  const enabledFor = data.value.enabled_for
  if (!Array.isArray(enabledFor)) {
    throw new Error('Local-video feature flag is malformed; cleanup stopped')
  }

  if (enabledFor.includes('admin')) {
    throw new Error(
      'Disable admin local-video uploads before executing video cleanup',
    )
  }
}

function normalizeProjectUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl !== rawUrl.trim()) return null
  const match = /^https:\/\/([a-z0-9]{20}[.]supabase[.]co)\/?$/.exec(rawUrl)
  return match ? `https://${match[1]}` : null
}

function redact(value) {
  return String(value || 'Unknown error')
    .replace(/(authorization|apikey|token)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/sb_(?:secret|service_role)_[A-Za-z0-9._-]+/gi, '[redacted]')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '[redacted]')
}

function errorMessage(error) {
  if (error && typeof error === 'object' && 'message' in error) {
    return redact(error.message)
  }
  return redact(error)
}

function publicUrlFor(projectUrl, objectPath) {
  return `${projectUrl}/storage/v1/object/public/${VIDEO_BUCKET}/${objectPath}`
}

function isValidTrackingPath(row) {
  if (
    !row
    || typeof row.id !== 'string'
    || typeof row.admin_id !== 'string'
    || typeof row.upload_path !== 'string'
    || typeof row.object_path !== 'string'
    || !UUID_VALUE.test(row.id)
    || !UUID_VALUE.test(row.admin_id)
    || !RESERVATION_PATH.test(row.upload_path)
    || !FINAL_PATH.test(row.object_path)
  ) {
    return false
  }

  const uploadSuffix = row.upload_path.slice('reservations/'.length)
  const finalSuffix = row.object_path.slice('videos/'.length)
  return uploadSuffix === finalSuffix
    && uploadSuffix.startsWith(`${row.admin_id.toLowerCase()}/`)
}

function sameTrackedObject(left, right) {
  return Boolean(left && right)
    && left.id === right.id
    && left.admin_id === right.admin_id
    && left.status === right.status
    && left.upload_path === right.upload_path
    && left.object_path === right.object_path
    && left.expires_at === right.expires_at
    && left.finalized_at === right.finalized_at
}

function referenceTokens(projectUrl, row) {
  return Array.from(new Set([
    row.upload_path,
    row.object_path,
    publicUrlFor(projectUrl, row.upload_path),
    publicUrlFor(projectUrl, row.object_path),
  ]))
}

function findReferenceInRows(rows, tokens) {
  for (const row of rows) {
    const html = typeof row.content_html === 'string' ? row.content_html : ''
    let json = ''
    try {
      json = row.content_json == null ? '' : JSON.stringify(row.content_json)
    } catch {
      return { postId: row.id, fields: ['content_json (unreadable)'] }
    }

    const fields = []
    if (tokens.some((token) => html.includes(token))) fields.push('content_html')
    if (tokens.some((token) => json.includes(token))) fields.push('content_json')
    if (fields.length > 0) return { postId: row.id, fields }
  }
  return null
}

async function loadAllForumPosts(supabase) {
  const rows = []
  for (let from = 0; ; from += POST_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('forum_posts')
      .select('id,content_html,content_json')
      .order('id', { ascending: true })
      .range(from, from + POST_PAGE_SIZE - 1)
    if (error) throw new Error(`Could not scan forum_posts: ${errorMessage(error)}`)
    rows.push(...(data || []))
    if (!data || data.length < POST_PAGE_SIZE) break
  }
  return rows
}

async function findImmediateReference(supabase, tokens) {
  for (let from = 0; ; from += POST_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('forum_posts')
      .select('id,content_html,content_json')
      .order('id', { ascending: true })
      .range(from, from + POST_PAGE_SIZE - 1)
    if (error) {
      throw new Error(`Final forum_posts reference check failed: ${errorMessage(error)}`)
    }

    const reference = findReferenceInRows(data || [], tokens)
    if (reference) return reference
    if (!data || data.length < POST_PAGE_SIZE) return null
  }
}

function isNotFoundStorageError(error) {
  const status = Number(error?.status || error?.statusCode)
  const message = String(error?.message || '')
  return (status === 400 || status === 404)
    && /not[ -]?found|does not exist/i.test(message)
}

async function objectExists(bucket, objectPath) {
  const { data, error } = await bucket.info(objectPath)
  if (!error) return Boolean(data)
  if (isNotFoundStorageError(error)) return false
  throw new Error(`Storage inspection failed for ${objectPath}: ${errorMessage(error)}`)
}

async function loadFreshTrackingRow(supabase, id) {
  const { data, error } = await supabase
    .from('forum_video_uploads')
    .select(TRACKING_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Could not re-read reservation ${id}: ${errorMessage(error)}`)
  return data
}

async function removeOneObject(bucket, objectPath) {
  const { error } = await bucket.remove([objectPath])
  if (error) throw new Error(`Storage removal failed for ${objectPath}: ${errorMessage(error)}`)
  if (await objectExists(bucket, objectPath)) {
    throw new Error(`Storage still reports ${objectPath} after remove returned successfully`)
  }
}

async function markTrackingRowDeleted(supabase, row, expectedStatus) {
  const { data, error } = await supabase
    .from('forum_video_uploads')
    .update({ status: 'deleted', deleted_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', expectedStatus)
    .eq('upload_path', row.upload_path)
    .eq('object_path', row.object_path)
    .select('id')
    .maybeSingle()
  if (error) {
    throw new Error(
      `Storage cleanup completed, but tracking row ${row.id} could not be marked deleted: ${errorMessage(error)}`,
    )
  }
  if (!data) {
    throw new Error(
      `Storage cleanup completed, but tracking row ${row.id} changed before its status update`,
    )
  }
}

function stillEligibleExpired(row, cutoff) {
  const expiresAt = Date.parse(row?.expires_at || '')
  return row?.status === 'reserved'
    && isValidTrackingPath(row)
    && Number.isFinite(expiresAt)
    && expiresAt <= cutoff.getTime()
}

function stillEligibleFinalized(row, cutoff) {
  const finalizedAt = Date.parse(row?.finalized_at || '')
  return row?.status === 'finalized'
    && isValidTrackingPath(row)
    && Number.isFinite(finalizedAt)
    && finalizedAt <= cutoff.getTime()
}

async function executeExpiredReservation({
  supabase,
  bucket,
  candidate,
  cutoff,
  projectUrl,
}) {
  const row = await loadFreshTrackingRow(supabase, candidate.id)
  if (!stillEligibleExpired(row, cutoff)) {
    console.log(`[skipped] expired reservation ${candidate.id}: row changed or is no longer eligible`)
    return
  }

  if (await objectExists(bucket, row.object_path)) {
    console.log(`[blocked] expired reservation ${row.id}: final-path object exists; investigate partial finalization`)
    return
  }
  const temporaryObjectExists = await objectExists(bucket, row.upload_path)
  const reference = await findImmediateReference(
    supabase,
    referenceTokens(projectUrl, row),
  )
  if (reference) {
    console.log(`[blocked] expired reservation ${row.id}: referenced by post ${reference.postId} (${reference.fields.join(', ')})`)
    return
  }

  const finalRow = await loadFreshTrackingRow(supabase, row.id)
  if (!stillEligibleExpired(finalRow, cutoff) || !sameTrackedObject(row, finalRow)) {
    console.log(`[skipped] expired reservation ${row.id}: row changed during final checks`)
    return
  }
  if (await objectExists(bucket, finalRow.object_path)) {
    console.log(`[blocked] expired reservation ${row.id}: final-path object appeared during final checks`)
    return
  }

  await assertVideoWritesPaused(supabase)
  if (temporaryObjectExists) await removeOneObject(bucket, finalRow.upload_path)
  await markTrackingRowDeleted(supabase, finalRow, 'reserved')
  console.log(`[deleted] expired reservation ${row.id}: ${temporaryObjectExists ? finalRow.upload_path : 'tracking row only (temporary object absent)'}`)
}

async function executeFinalizedOrphan({
  supabase,
  bucket,
  candidate,
  cutoff,
  projectUrl,
}) {
  const row = await loadFreshTrackingRow(supabase, candidate.id)
  if (!stillEligibleFinalized(row, cutoff)) {
    console.log(`[skipped] finalized video ${candidate.id}: row changed or is no longer eligible`)
    return
  }
  if (!(await objectExists(bucket, row.object_path))) {
    console.log(`[blocked] finalized video ${row.id}: tracked object is missing; tracking row unchanged`)
    return
  }

  const reference = await findImmediateReference(
    supabase,
    referenceTokens(projectUrl, row),
  )
  if (reference) {
    console.log(`[blocked] finalized video ${row.id}: referenced by post ${reference.postId} (${reference.fields.join(', ')})`)
    return
  }

  const finalRow = await loadFreshTrackingRow(supabase, row.id)
  if (!stillEligibleFinalized(finalRow, cutoff) || !sameTrackedObject(row, finalRow)) {
    console.log(`[skipped] finalized video ${row.id}: row changed during final checks`)
    return
  }
  if (!(await objectExists(bucket, finalRow.object_path))) {
    console.log(`[blocked] finalized video ${row.id}: object disappeared during final checks`)
    return
  }

  await assertVideoWritesPaused(supabase)
  await removeOneObject(bucket, finalRow.object_path)
  await markTrackingRowDeleted(supabase, finalRow, 'finalized')
  console.log(`[deleted] finalized orphan ${row.id}: ${finalRow.object_path}`)
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp()
    return
  }

  const configuredUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const projectUrl = normalizeProjectUrl(configuredUrl)
  if (!projectUrl) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL must be an exact HTTPS hosted Supabase project origin',
    )
  }
  const projectRef = new URL(projectUrl).hostname.split('.')[0]
  const options = parseArguments(argv, projectRef)

  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required (it is read but never printed)')
  }

  const supabase = createClient(projectUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })

  const { data: bucketInfo, error: bucketError } = await supabase.storage.getBucket(VIDEO_BUCKET)
  if (bucketError) {
    throw new Error(`Could not verify Storage bucket: ${errorMessage(bucketError)}`)
  }
  if (!bucketInfo || bucketInfo.id !== VIDEO_BUCKET) {
    throw new Error(`Refusing to operate: expected only Storage bucket ${VIDEO_BUCKET}`)
  }

  const bucket = supabase.storage.from(VIDEO_BUCKET)
  const now = new Date()
  const expiredCutoff = new Date(
    now.getTime() - RESERVATION_GRACE_HOURS * 60 * 60 * 1000,
  )
  const finalizedCutoff = new Date(
    now.getTime() - FINALIZED_ORPHAN_GRACE_DAYS * 24 * 60 * 60 * 1000,
  )
  const mode = options.executeExpiredReservations
    ? 'EXECUTE expired reservations'
    : options.executeFinalizedOrphans
      ? 'EXECUTE finalized orphans'
      : 'DRY RUN'

  if (options.executeExpiredReservations || options.executeFinalizedOrphans) {
    await assertVideoWritesPaused(supabase)
  }

  console.log(`Project: ${projectRef}`)
  console.log(`Bucket: ${VIDEO_BUCKET}`)
  console.log(`Mode: ${mode}`)
  console.log(`Candidate limit per category: ${options.limit}`)
  console.log(`Expired-reservation cutoff: ${expiredCutoff.toISOString()}`)
  console.log(`Finalized-orphan cutoff: ${finalizedCutoff.toISOString()}`)

  const [expiredResult, finalizedResult, forumPosts] = await Promise.all([
    supabase
      .from('forum_video_uploads')
      .select(TRACKING_COLUMNS)
      .eq('status', 'reserved')
      .lte('expires_at', expiredCutoff.toISOString())
      .order('expires_at', { ascending: true })
      .limit(options.limit),
    supabase
      .from('forum_video_uploads')
      .select(TRACKING_COLUMNS)
      .eq('status', 'finalized')
      .lte('finalized_at', finalizedCutoff.toISOString())
      .order('finalized_at', { ascending: true })
      .limit(options.limit),
    loadAllForumPosts(supabase),
  ])

  if (expiredResult.error) {
    throw new Error(`Could not list expired reservations: ${errorMessage(expiredResult.error)}`)
  }
  if (finalizedResult.error) {
    throw new Error(`Could not list finalized videos: ${errorMessage(finalizedResult.error)}`)
  }

  const expired = expiredResult.data || []
  const finalized = finalizedResult.data || []
  console.log(`\nExpired temporary reservations (${expired.length}):`)

  for (const row of expired) {
    if (!stillEligibleExpired(row, expiredCutoff)) {
      console.log(`[blocked] ${row.id}: invalid path or tracking state`)
      continue
    }
    const reference = findReferenceInRows(
      forumPosts,
      referenceTokens(projectUrl, row),
    )
    if (reference) {
      console.log(`[kept] ${row.id}: referenced by post ${reference.postId} (${reference.fields.join(', ')})`)
      continue
    }
    if (await objectExists(bucket, row.object_path)) {
      console.log(`[blocked] ${row.id}: final-path object exists; investigate partial finalization`)
      continue
    }
    const temporaryExists = await objectExists(bucket, row.upload_path)
    console.log(`[candidate] ${row.id}: ${row.upload_path} (${temporaryExists ? 'object exists' : 'object absent'})`)
    if (options.executeExpiredReservations) {
      await executeExpiredReservation({
        supabase,
        bucket,
        candidate: row,
        cutoff: expiredCutoff,
        projectUrl,
      })
    }
  }
  if (expired.length === options.limit) {
    console.log(`[notice] expired reservation result reached limit ${options.limit}; more rows may remain`)
  }

  console.log(`\nFinalized potential orphans (${finalized.length}):`)
  for (const row of finalized) {
    if (!stillEligibleFinalized(row, finalizedCutoff)) {
      console.log(`[blocked] ${row.id}: invalid path or tracking state`)
      continue
    }
    const reference = findReferenceInRows(
      forumPosts,
      referenceTokens(projectUrl, row),
    )
    if (reference) {
      console.log(`[kept] ${row.id}: referenced by post ${reference.postId} (${reference.fields.join(', ')})`)
      continue
    }
    if (!(await objectExists(bucket, row.object_path))) {
      console.log(`[blocked] ${row.id}: tracked finalized object is missing`)
      continue
    }
    console.log(`[candidate] ${row.id}: ${row.object_path}`)
    if (options.executeFinalizedOrphans) {
      await executeFinalizedOrphan({
        supabase,
        bucket,
        candidate: row,
        cutoff: finalizedCutoff,
        projectUrl,
      })
    }
  }
  if (finalized.length === options.limit) {
    console.log(`[notice] finalized result reached limit ${options.limit}; more rows may remain`)
  }

  if (!options.executeExpiredReservations && !options.executeFinalizedOrphans) {
    console.log('\nDry run complete. Nothing was deleted or updated.')
  }
}

main().catch((error) => {
  console.error(`Cleanup stopped safely: ${errorMessage(error)}`)
  process.exitCode = 1
})
