import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  reserveForumVideo,
  uploadFileToSignedUrl,
  uploadForumVideo,
  type VideoFetch,
  type VideoUploadProgress,
} from './video-upload-client'
import { MAX_VIDEO_SIZE } from './video-upload'

const ADMIN_ID = '7de72fea-5bb0-4b8a-a8ca-06ec2ffec947'
const VIDEO_ID = '4a54a2f2-d662-4b5f-9fef-8bfbe8ebbd2b'
const RESERVATION_ID = '01cce10d-c96e-4ad7-a92f-9725b007265f'
const ORIGIN = 'https://ycjuceortcduakxscfes.supabase.co'

process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGIN
process.env.VERCEL_ENV = 'test'

function paths(extension: 'mp4' | 'webm') {
  const suffix = `${ADMIN_ID}/2026/07/${VIDEO_ID}.${extension}`
  const uploadPath = `reservations/${suffix}`
  const objectPath = `videos/${suffix}`
  return {
    uploadPath,
    objectPath,
    signedUrl: `${ORIGIN}/storage/v1/object/upload/sign/forum-videos/${uploadPath}?token=test-signed-token`,
    publicUrl: `${ORIGIN}/storage/v1/object/public/forum-videos/${objectPath}`,
  }
}

type XhrCapture = {
  method?: string
  url?: string
  async?: boolean
  headers: Record<string, string>
  body?: Document | XMLHttpRequestBodyInit | null
  withCredentials?: boolean
  timeout?: number
}

function fakeXhrFactory(
  capture: XhrCapture,
  status = 200,
  events: string[] = [],
) {
  return () => {
    const upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
      onprogress: null,
    }
    const xhr = {
      status,
      upload,
      withCredentials: true,
      timeout: 0,
      onload: null as ((event: ProgressEvent) => void) | null,
      onerror: null as ((event: ProgressEvent) => void) | null,
      onabort: null as ((event: ProgressEvent) => void) | null,
      ontimeout: null as ((event: ProgressEvent) => void) | null,
      open(method: string, url: string, async = true) {
        capture.method = method
        capture.url = url
        capture.async = async
      },
      setRequestHeader(name: string, value: string) {
        capture.headers[name.toLowerCase()] = value
      },
      send(body?: Document | XMLHttpRequestBodyInit | null) {
        capture.body = body
        capture.withCredentials = xhr.withCredentials
        capture.timeout = xhr.timeout
        events.push('storage-upload')
        upload.onprogress?.({
          lengthComputable: true,
          loaded: 5,
          total: 10,
        } as ProgressEvent)
        xhr.onload?.({} as ProgressEvent)
      },
    }
    return xhr as unknown as XMLHttpRequest
  }
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

function makeSuccessfulFetch(
  file: File,
  extension: 'mp4' | 'webm',
  events: string[],
): VideoFetch {
  const videoPaths = paths(extension)
  let call = 0
  return async (input, init) => {
    call += 1
    const url = String(input)
    assert.equal(init?.method, 'POST')
    assert.equal(init?.credentials, 'same-origin')
    assert.equal(init?.cache, 'no-store')

    if (call === 1) {
      events.push('reservation')
      assert.equal(url, '/api/admin/forum/upload/video')
      assert.deepEqual(JSON.parse(String(init?.body)), {
        name: file.name,
        size: file.size,
        type: file.type,
      })
      return json({
        ok: true,
        data: {
          reservationId: RESERVATION_ID,
          uploadPath: videoPaths.uploadPath,
          signedUrl: videoPaths.signedUrl,
          mimeType: file.type,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      })
    }

    events.push('finalization')
    assert.equal(url, '/api/admin/forum/upload/video/finalize')
    assert.deepEqual(JSON.parse(String(init?.body)), {
      reservationId: RESERVATION_ID,
    })
    return json({
      ok: true,
      data: {
        publicUrl: videoPaths.publicUrl,
        objectPath: videoPaths.objectPath,
        mimeType: file.type,
        fileSize: file.size,
      },
    })
  }
}

describe('direct local-video upload client', () => {
  for (const fixture of [
    { extension: 'mp4' as const, mime: 'video/mp4', bytes: 'mp4-bytes' },
    { extension: 'webm' as const, mime: 'video/webm', bytes: 'webm-bytes' },
  ]) {
    it(`uploads ${fixture.extension.toUpperCase()} directly, reports progress, then finalizes`, async () => {
      const file = new File([fixture.bytes], `lesson.${fixture.extension}`, {
        type: fixture.mime,
      })
      const events: string[] = []
      const progress: VideoUploadProgress[] = []
      const capture: XhrCapture = { headers: {} }

      const result = await uploadForumVideo(file, {
        fetchImpl: makeSuccessfulFetch(file, fixture.extension, events),
        xhrFactory: fakeXhrFactory(capture, 201, events),
        onProgress: (value) => progress.push(value),
      })

      assert.deepEqual(events, ['reservation', 'storage-upload', 'finalization'])
      assert.equal(capture.method, 'PUT')
      assert.equal(capture.url, paths(fixture.extension).signedUrl)
      assert.equal(capture.async, true)
      assert.equal(capture.headers['x-upsert'], 'false')
      assert.equal(capture.withCredentials, false)
      assert.equal(capture.timeout, 30 * 60 * 1000)
      assert.ok(capture.body instanceof FormData)
      assert.equal((capture.body as FormData).get('cacheControl'), '31536000')
      assert.ok((capture.body as FormData).get('') instanceof File)
      assert.deepEqual(progress, [
        { phase: 'reserving', percent: 0 },
        { phase: 'uploading', percent: 0 },
        { phase: 'uploading', percent: 50 },
        { phase: 'uploading', percent: 100 },
        { phase: 'finalizing', percent: 100 },
      ])
      assert.equal(result.publicUrl, paths(fixture.extension).publicUrl)
      assert.equal(result.mime, fixture.mime)
      assert.equal(result.fileSize, file.size)
    })
  }

  it('validates size and MIME locally before contacting either API', async () => {
    let fetchCalled = false
    const fetchImpl: VideoFetch = async () => {
      fetchCalled = true
      throw new Error('must not fetch')
    }
    const invalidMime = new File(['text'], 'lesson.mov', { type: 'video/quicktime' })
    await assert.rejects(uploadForumVideo(invalidMime, { fetchImpl }), /Only MP4 and WebM/i)

    const oversized = {
      name: 'huge.mp4',
      type: 'video/mp4',
      size: MAX_VIDEO_SIZE + 1,
    } as File
    await assert.rejects(uploadForumVideo(oversized, { fetchImpl }), /too large/i)
    assert.equal(fetchCalled, false)
  })

  it('rejects a non-JSON API response without attempting Storage upload', async () => {
    const file = new File(['video'], 'lesson.mp4', { type: 'video/mp4' })
    let xhrCalled = false
    await assert.rejects(uploadForumVideo(file, {
      fetchImpl: async () => new Response('<html>failure</html>', {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      }),
      xhrFactory: () => {
        xhrCalled = true
        throw new Error('must not create XHR')
      },
    }), /non-JSON response/i)
    assert.equal(xhrCalled, false)
  })

  it('rejects a signed URL from a bad Storage origin', async () => {
    const file = new File(['video'], 'lesson.mp4', { type: 'video/mp4' })
    const videoPaths = paths('mp4')
    await assert.rejects(reserveForumVideo(file, async () => json({
      ok: true,
      data: {
        reservationId: RESERVATION_ID,
        uploadPath: videoPaths.uploadPath,
        signedUrl: videoPaths.signedUrl.replace(ORIGIN, 'https://evil.example'),
        mimeType: 'video/mp4',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    })), /invalid reservation data/i)
  })

  it('rejects malformed reservation identifiers before uploading to Storage', async () => {
    const file = new File(['video'], 'lesson.mp4', { type: 'video/mp4' })
    const videoPaths = paths('mp4')

    await assert.rejects(reserveForumVideo(file, async () => json({
      ok: true,
      data: {
        reservationId: 'not-a-uuid',
        uploadPath: videoPaths.uploadPath,
        signedUrl: videoPaths.signedUrl,
        mimeType: 'video/mp4',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    })), /invalid reservation data/i)
  })

  it('uses no-overwrite and stops before finalization on a Storage conflict', async () => {
    const file = new File(['video'], 'lesson.mp4', { type: 'video/mp4' })
    const videoPaths = paths('mp4')
    const capture: XhrCapture = { headers: {} }
    await assert.rejects(uploadFileToSignedUrl(
      videoPaths.signedUrl,
      videoPaths.uploadPath,
      file,
      { xhrFactory: fakeXhrFactory(capture, 409) },
    ), /refused to overwrite/i)
    assert.equal(capture.headers['x-upsert'], 'false')
  })

  it('does not report a finalized video when finalization fails', async () => {
    const file = new File(['video'], 'lesson.mp4', { type: 'video/mp4' })
    const videoPaths = paths('mp4')
    let call = 0
    const fetchImpl: VideoFetch = async () => {
      call += 1
      if (call === 1) {
        return json({
          ok: true,
          data: {
            reservationId: RESERVATION_ID,
            uploadPath: videoPaths.uploadPath,
            signedUrl: videoPaths.signedUrl,
            mimeType: 'video/mp4',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        })
      }
      return json({ ok: false, error: 'File signature is invalid' }, 400)
    }

    await assert.rejects(uploadForumVideo(file, {
      fetchImpl,
      xhrFactory: fakeXhrFactory({ headers: {} }),
    }), /signature is invalid/i)
    assert.equal(call, 2)
  })

  it('retries an idempotent transient finalization failure without re-uploading', async () => {
    const file = new File(['video'], 'lesson.mp4', { type: 'video/mp4' })
    const videoPaths = paths('mp4')
    const events: string[] = []
    let fetchCall = 0

    const result = await uploadForumVideo(file, {
      xhrFactory: fakeXhrFactory({ headers: {} }, 201, events),
      fetchImpl: async (input) => {
        fetchCall += 1
        if (fetchCall === 1) {
          events.push('reservation')
          return json({
            ok: true,
            data: {
              reservationId: RESERVATION_ID,
              uploadPath: videoPaths.uploadPath,
              signedUrl: videoPaths.signedUrl,
              mimeType: 'video/mp4',
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          })
        }

        assert.equal(String(input), '/api/admin/forum/upload/video/finalize')
        events.push(`finalization-${fetchCall - 1}`)
        if (fetchCall === 2) {
          return json({ ok: false, error: 'Temporary finalization failure' }, 502)
        }

        return json({
          ok: true,
          data: {
            publicUrl: videoPaths.publicUrl,
            objectPath: videoPaths.objectPath,
            mimeType: 'video/mp4',
            fileSize: file.size,
          },
        })
      },
    })

    assert.equal(result.objectPath, videoPaths.objectPath)
    assert.equal(fetchCall, 3)
    assert.deepEqual(events, [
      'reservation',
      'storage-upload',
      'finalization-1',
      'finalization-2',
    ])
  })
})
