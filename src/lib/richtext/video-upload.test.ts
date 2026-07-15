import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildForumVideoPublicUrl,
  buildVideoPaths,
  collectTipTapLocalVideos,
  detectVideoMime,
  haveMatchingVideoReferences,
  isApprovedSignedVideoUploadUrl,
  MAX_VIDEO_FILENAME_LENGTH,
  MAX_VIDEO_SIZE,
  MAX_VIDEOS_PER_POST,
  parseForumVideoPublicUrl,
  validateVideoUploadInput,
} from './video-upload'

const ADMIN_ID = '7de72fea-5bb0-4b8a-a8ca-06ec2ffec947'
const VIDEO_ID = '4a54a2f2-d662-4b5f-9fef-8bfbe8ebbd2b'
const DATE = new Date('2026-07-15T00:00:00.000Z')
const PRODUCTION_ORIGIN = 'https://ycjuceortcduakxscfes.supabase.co'

process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION_ORIGIN
process.env.VERCEL_ENV = 'test'

const mp4Header = new Uint8Array([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d,
])
const webmHeader = new Uint8Array([
  0x1a, 0x45, 0xdf, 0xa3,
  0x42, 0x82, 0x84,
  0x77, 0x65, 0x62, 0x6d,
])

function finalVideo(mime: 'video/mp4' | 'video/webm' = 'video/mp4') {
  const { objectPath } = buildVideoPaths(ADMIN_ID, mime, DATE, VIDEO_ID)
  const publicUrl = buildForumVideoPublicUrl(objectPath)
  assert.ok(publicUrl)
  return { mime, objectPath, publicUrl }
}

describe('local video upload validation', () => {
  it('accepts MP4 and WebM files at or below the 50 MB limit', () => {
    assert.deepEqual(validateVideoUploadInput({
      name: 'lesson.mp4',
      declaredMime: 'video/mp4',
      size: MAX_VIDEO_SIZE,
    }), { ok: true, mime: 'video/mp4', extension: 'mp4' })

    assert.deepEqual(validateVideoUploadInput({
      name: 'lesson.webm',
      declaredMime: 'video/webm',
      size: 42,
    }), { ok: true, mime: 'video/webm', extension: 'webm' })
  })

  it('rejects oversized, empty, unsupported, and non-integer sizes', () => {
    assert.equal(validateVideoUploadInput({
      name: 'big.mp4', declaredMime: 'video/mp4', size: MAX_VIDEO_SIZE + 1,
    }).ok, false)
    assert.equal(validateVideoUploadInput({
      name: 'empty.mp4', declaredMime: 'video/mp4', size: 0,
    }).ok, false)
    assert.equal(validateVideoUploadInput({
      name: 'movie.mov', declaredMime: 'video/quicktime', size: 100,
    }).ok, false)
    assert.equal(validateVideoUploadInput({
      name: 'fraction.mp4', declaredMime: 'video/mp4', size: 1.5,
    }).ok, false)
  })

  it('rejects a fake or mismatched filename extension', () => {
    assert.equal(validateVideoUploadInput({
      name: 'fake.webm', declaredMime: 'video/mp4', size: 100,
    }).ok, false)
    assert.equal(validateVideoUploadInput({
      name: 'missing-extension', declaredMime: 'video/webm', size: 100,
    }).ok, false)
  })

  it('rejects path-like, control-character, padded, and overlong filenames', () => {
    for (const name of [
      '../movie.mp4',
      'folder\\movie.mp4',
      ' movie.mp4',
      'movie\u0000.mp4',
      `${'a'.repeat(MAX_VIDEO_FILENAME_LENGTH)}.mp4`,
    ]) {
      assert.equal(validateVideoUploadInput({
        name,
        declaredMime: 'video/mp4',
        size: 100,
      }).ok, false)
    }
  })

  it('detects MP4 and WebM signatures and rejects fake content', () => {
    assert.equal(detectVideoMime(mp4Header), 'video/mp4')
    assert.equal(detectVideoMime(webmHeader), 'video/webm')
    assert.equal(detectVideoMime(new TextEncoder().encode('<script>not video</script>')), null)
    assert.equal(detectVideoMime(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])), null)
  })
})

describe('local video paths and origins', () => {
  it('builds distinct UUID reservation paths without overwrite semantics', () => {
    const first = buildVideoPaths(ADMIN_ID, 'video/mp4', DATE, VIDEO_ID)
    const second = buildVideoPaths(
      ADMIN_ID,
      'video/mp4',
      DATE,
      '7e189e90-d37b-4c50-9b91-184a57fbfc13',
    )

    assert.equal(
      first.uploadPath,
      `reservations/${ADMIN_ID}/2026/07/${VIDEO_ID}.mp4`,
    )
    assert.equal(
      first.objectPath,
      `videos/${ADMIN_ID}/2026/07/${VIDEO_ID}.mp4`,
    )
    assert.notEqual(first.uploadPath, second.uploadPath)
    assert.notEqual(first.objectPath, second.objectPath)
  })

  it('accepts only the exact approved Supabase public origin and final path', () => {
    const video = finalVideo()
    assert.deepEqual(parseForumVideoPublicUrl(video.publicUrl), video)

    for (const invalid of [
      video.publicUrl.replace(PRODUCTION_ORIGIN, 'https://evil.example'),
      video.publicUrl.replace('ycjuceortcduakxscfes.supabase.co', 'ycjuceortcduakxscfes.supabase.co.evil.test'),
      `${video.publicUrl}?download=1`,
      `${video.publicUrl}#fragment`,
      video.publicUrl.replace('/videos/', '/reservations/'),
      video.publicUrl.replace('/videos/', '/reservations/../videos/'),
      video.publicUrl.replace(PRODUCTION_ORIGIN, `${PRODUCTION_ORIGIN}:443`),
      video.publicUrl.replace('/2026/', '/%32%30%32%36/'),
      video.publicUrl.replace(VIDEO_ID, VIDEO_ID.toUpperCase()),
    ]) {
      assert.equal(parseForumVideoPublicUrl(invalid), null, invalid)
    }
  })

  it('rejects a saved URL when it does not match the configured project', () => {
    const productionVideo = finalVideo()
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      'https://abcdefghijklmnopqrst.supabase.co'
    try {
      assert.equal(parseForumVideoPublicUrl(productionVideo.publicUrl), null)
      const alternateUrl = buildForumVideoPublicUrl(productionVideo.objectPath)
      assert.match(
        alternateUrl || '',
        /^https:\/\/abcdefghijklmnopqrst[.]supabase[.]co\//,
      )
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION_ORIGIN
    }
  })

  it('accepts only an exact, token-only signed upload URL for the reserved path', () => {
    const { uploadPath } = buildVideoPaths(ADMIN_ID, 'video/webm', DATE, VIDEO_ID)
    const signed = `${PRODUCTION_ORIGIN}/storage/v1/object/upload/sign/forum-videos/${uploadPath}?token=signed-token`
    assert.equal(isApprovedSignedVideoUploadUrl(signed, uploadPath), true)
    assert.equal(isApprovedSignedVideoUploadUrl(`${signed}&upsert=true`, uploadPath), false)
    assert.equal(isApprovedSignedVideoUploadUrl(signed.replace('supabase.co', 'supabase.co.evil.test'), uploadPath), false)
    assert.equal(isApprovedSignedVideoUploadUrl(signed.replace(VIDEO_ID, '7e189e90-d37b-4c50-9b91-184a57fbfc13'), uploadPath), false)
  })
})

describe('TipTap local video references', () => {
  it('collects canonical localVideo nodes and preserves duplicates', () => {
    const video = finalVideo()
    const json = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
        { type: 'localVideo', attrs: { src: video.publicUrl, mimeType: video.mime } },
        { type: 'localVideo', attrs: { src: video.publicUrl, mimeType: video.mime } },
      ],
    }
    const result = collectTipTapLocalVideos(json)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.videos.length, 2)
      assert.equal(haveMatchingVideoReferences(result.videos, [video, video]), true)
    }
  })

  it('rejects the fourth node and mismatched MIME attributes', () => {
    const video = finalVideo()
    const nodes = Array.from({ length: MAX_VIDEOS_PER_POST + 1 }, () => ({
      type: 'localVideo',
      attrs: { src: video.publicUrl, mimeType: video.mime },
    }))
    assert.equal(collectTipTapLocalVideos({ type: 'doc', content: nodes }).ok, false)
    assert.equal(collectTipTapLocalVideos({
      type: 'doc',
      content: [{
        type: 'localVideo',
        attrs: { src: video.publicUrl, mimeType: 'video/webm' },
      }],
    }).ok, false)
  })
})
