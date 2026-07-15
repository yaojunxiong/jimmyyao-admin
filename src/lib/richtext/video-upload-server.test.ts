import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AdminCheck } from '@/lib/admin-auth'
import {
  authorizeVideoAdmin,
  evaluateHourlyReservationCount,
  readVideoHeader,
  validateFinalizedVideoPaths,
  verifyStoredVideo,
  videoJsonResponse,
  videoMethodNotAllowed,
} from './video-upload-server'
import { MAX_VIDEOS_PER_HOUR } from './video-upload'

const admin: AdminCheck = {
  userAuthed: true,
  isAdmin: true,
  role: 'admin',
  bypassed: false,
  userId: '7de72fea-5bb0-4b8a-a8ca-06ec2ffec947',
  userEmail: 'admin@example.test',
}

const mp4Header = new Uint8Array([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d,
])
const approvedVideoUrl =
  'https://ycjuceortcduakxscfes.supabase.co/storage/v1/object/public/forum-videos/videos/7de72fea-5bb0-4b8a-a8ca-06ec2ffec947/2026/07/4a54a2f2-d662-4b5f-9fef-8bfbe8ebbd2b.mp4'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ycjuceortcduakxscfes.supabase.co'
process.env.VERCEL_ENV = 'test'

describe('video API authorization and JSON responses', () => {
  it('accepts an identified admin', () => {
    assert.equal(authorizeVideoAdmin(admin), null)
  })

  it('rejects anonymous and ordinary-member callers', () => {
    assert.deepEqual(authorizeVideoAdmin({
      ...admin,
      userAuthed: false,
      isAdmin: false,
      role: 'none',
      userId: undefined,
    }), { error: 'Not authenticated', status: 401 })

    assert.deepEqual(authorizeVideoAdmin({
      ...admin,
      isAdmin: false,
      role: 'member',
    }), { error: 'Not authorized', status: 403 })
  })

  it('returns JSON for error outcomes with defensive headers', async () => {
    const response = videoJsonResponse({ ok: false, error: 'Invalid JSON body' }, 400)
    assert.equal(response.status, 400)
    assert.match(response.headers.get('content-type') || '', /^application\/json/i)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(await response.json(), { ok: false, error: 'Invalid JSON body' })
  })

  it('returns JSON for unsupported HTTP methods', async () => {
    const response = videoMethodNotAllowed()
    assert.equal(response.status, 405)
    assert.equal(response.headers.get('allow'), 'POST')
    assert.match(response.headers.get('content-type') || '', /^application\/json/i)
    assert.deepEqual(await response.json(), { ok: false, error: 'Method not allowed' })
  })
})

describe('hourly reservation enforcement', () => {
  it('allows counts below the cap and rejects the cap', () => {
    assert.equal(evaluateHourlyReservationCount(MAX_VIDEOS_PER_HOUR - 1, false), null)
    assert.equal(evaluateHourlyReservationCount(MAX_VIDEOS_PER_HOUR, false)?.status, 429)
  })

  it('fails closed when an exact count is unavailable or invalid', () => {
    assert.equal(evaluateHourlyReservationCount(null, false)?.status, 500)
    assert.equal(evaluateHourlyReservationCount(0, true)?.status, 500)
    assert.equal(evaluateHourlyReservationCount(-1, false)?.status, 500)
    assert.equal(evaluateHourlyReservationCount(1.5, false)?.status, 500)
  })
})

describe('server-side finalization verification', () => {
  it('reads only the expected byte range from the exact approved Storage URL', async () => {
    let requestedRange = ''
    const result = await readVideoHeader(
      approvedVideoUrl,
      mp4Header.byteLength,
      async (_url, init) => {
        requestedRange = new Headers(init?.headers).get('range') || ''
        assert.equal(init?.redirect, 'error')
        assert.equal(init?.cache, 'no-store')
        assert.ok(init?.signal instanceof AbortSignal)
        return new Response(mp4Header, {
          status: 206,
          headers: { 'Content-Range': `bytes 0-${mp4Header.byteLength - 1}/${mp4Header.byteLength}` },
        })
      },
    )
    assert.equal(result.ok, true)
    assert.equal(requestedRange, 'bytes=0-4095')
    if (result.ok) assert.deepEqual(result.bytes, mp4Header)
  })

  it('rejects SSRF targets, full-body responses, and inconsistent range metadata', async () => {
    let called = false
    assert.equal((await readVideoHeader(
      'https://evil.example/movie.mp4',
      mp4Header.byteLength,
      async () => {
        called = true
        throw new Error('must not fetch')
      },
    )).ok, false)
    assert.equal(called, false)

    assert.equal((await readVideoHeader(
      approvedVideoUrl,
      mp4Header.byteLength,
      async () => new Response(mp4Header, { status: 200 }),
    )).ok, false)

    assert.equal((await readVideoHeader(
      approvedVideoUrl,
      mp4Header.byteLength,
      async () => new Response(mp4Header, {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-11/999' },
      }),
    )).ok, false)
  })

  it('accepts matching Storage metadata and MP4 signature', () => {
    assert.deepEqual(verifyStoredVideo({
      expectedMime: 'video/mp4',
      expectedSize: 1000,
      headerBytes: mp4Header,
      info: { size: 1000, contentType: 'video/mp4' },
    }), { ok: true })
  })

  it('rejects mismatched size, MIME, and file signatures', () => {
    assert.equal(verifyStoredVideo({
      expectedMime: 'video/mp4',
      expectedSize: 1000,
      headerBytes: mp4Header,
      info: { size: 999, contentType: 'video/mp4' },
    }).ok, false)
    assert.equal(verifyStoredVideo({
      expectedMime: 'video/mp4',
      expectedSize: 1000,
      headerBytes: mp4Header,
      info: { size: 1000, contentType: 'video/webm' },
    }).ok, false)
    assert.equal(verifyStoredVideo({
      expectedMime: 'video/mp4',
      expectedSize: 1000,
      headerBytes: new TextEncoder().encode('definitely not video'),
      info: { size: 1000, contentType: 'video/mp4' },
    }).ok, false)
  })

  it('allows only object paths confirmed finalized by the tracking lookup', async () => {
    const wanted = ['videos/admin/2026/07/a.mp4', 'videos/admin/2026/07/b.webm']
    assert.deepEqual(await validateFinalizedVideoPaths(wanted, async () => ({
      objectPaths: [...wanted].reverse(),
      error: false,
    })), { ok: true })

    assert.equal((await validateFinalizedVideoPaths(wanted, async () => ({
      objectPaths: [wanted[0]],
      error: false,
    }))).ok, false)

    const failed = await validateFinalizedVideoPaths(wanted, async () => ({
      objectPaths: [],
      error: true,
    }))
    assert.equal(failed.ok, false)
    if (!failed.ok) assert.equal(failed.status, 500)
  })

  it('does not query the database for a post without local videos', async () => {
    let called = false
    const result = await validateFinalizedVideoPaths([], async () => {
      called = true
      return { objectPaths: [], error: false }
    })
    assert.deepEqual(result, { ok: true })
    assert.equal(called, false)
  })
})
