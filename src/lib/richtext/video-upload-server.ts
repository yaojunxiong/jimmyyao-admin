import type { AdminCheck } from '@/lib/admin-auth'
import {
  detectVideoMime,
  MAX_VIDEOS_PER_HOUR,
  parseForumVideoPublicUrl,
  parseReservedForumVideoPublicUrl,
  type AllowedVideoMime,
  VIDEO_SIGNATURE_BYTES,
} from './video-upload'

export type VideoApiFailure = {
  error: string
  status: number
}

export function videoJsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export function videoMethodNotAllowed(): Response {
  return Response.json(
    { ok: false, error: 'Method not allowed' },
    {
      status: 405,
      headers: {
        Allow: 'POST',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  )
}

export function authorizeVideoAdmin(adminCheck: AdminCheck): VideoApiFailure | null {
  if (!adminCheck.userAuthed) {
    return { error: 'Not authenticated', status: 401 }
  }

  if (!adminCheck.isAdmin || adminCheck.role !== 'admin') {
    return { error: 'Not authorized', status: 403 }
  }

  if (!adminCheck.userId) {
    return { error: 'Unable to identify user', status: 500 }
  }

  return null
}

export function evaluateHourlyReservationCount(
  count: number | null,
  hasError: boolean,
): VideoApiFailure | null {
  if (hasError || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    return { error: 'Unable to verify the video upload limit', status: 500 }
  }

  if (count >= MAX_VIDEOS_PER_HOUR) {
    return {
      error: `Video upload limit reached (maximum ${MAX_VIDEOS_PER_HOUR} per hour)`,
      status: 429,
    }
  }

  return null
}

export const RESERVATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type VideoHeaderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export const VIDEO_HEADER_TIMEOUT_MS = 15_000

export async function readVideoHeader(
  publicUrl: string,
  expectedSize: number,
  fetcher: VideoHeaderFetch = fetch,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  if (
    !Number.isSafeInteger(expectedSize)
    || expectedSize < 1
    || (
      !parseForumVideoPublicUrl(publicUrl)
      && !parseReservedForumVideoPublicUrl(publicUrl)
    )
  ) {
    return { ok: false, error: 'Video verification target is invalid' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    VIDEO_HEADER_TIMEOUT_MS,
  )

  try {
    const response = await fetcher(publicUrl, {
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
      headers: { Range: `bytes=0-${VIDEO_SIGNATURE_BYTES - 1}` },
    })

    if (response.status !== 206) {
      await response.body?.cancel().catch(() => undefined)
      return { ok: false, error: 'Storage did not honor the verification byte range' }
    }

    const contentRange = response.headers.get('content-range') || ''
    const rangeMatch = /^bytes 0-([0-9]+)\/([0-9]+)$/i.exec(contentRange)
    const expectedEnd = Math.min(expectedSize, VIDEO_SIGNATURE_BYTES) - 1
    if (
      !rangeMatch
      || Number(rangeMatch[1]) !== expectedEnd
      || Number(rangeMatch[2]) !== expectedSize
    ) {
      await response.body?.cancel().catch(() => undefined)
      return { ok: false, error: 'Storage returned inconsistent video size metadata' }
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length !== expectedEnd + 1 || bytes.length < 8) {
      return { ok: false, error: 'Storage returned an invalid verification range' }
    }

    return { ok: true, bytes }
  } catch {
    return { ok: false, error: 'Could not read uploaded video metadata' }
  } finally {
    clearTimeout(timeout)
  }
}

export type StoredVideoInfo = {
  contentType?: string | null
  size?: number | null
}

export function verifyStoredVideo(input: {
  expectedMime: AllowedVideoMime
  expectedSize: number
  headerBytes: Uint8Array
  info: StoredVideoInfo
}): { ok: true } | { ok: false; error: string } {
  if (input.info.size !== input.expectedSize) {
    return {
      ok: false,
      error: `File size mismatch: expected ${input.expectedSize}, got ${String(input.info.size)}`,
    }
  }

  if ((input.info.contentType || '').toLowerCase() !== input.expectedMime) {
    return {
      ok: false,
      error: 'Stored content type does not match the reserved video type',
    }
  }

  const detectedMime = detectVideoMime(input.headerBytes)
  if (!detectedMime) {
    return { ok: false, error: 'File content is not a valid MP4 or WebM video' }
  }

  if (detectedMime !== input.expectedMime) {
    return {
      ok: false,
      error: `Declared MIME type ${input.expectedMime} does not match detected ${detectedMime}`,
    }
  }

  return { ok: true }
}

export type FinalizedVideoLookup = (
  objectPaths: readonly string[],
) => Promise<{ objectPaths: readonly string[]; error: boolean }>

export async function validateFinalizedVideoPaths(
  objectPaths: readonly string[],
  lookup: FinalizedVideoLookup,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const uniquePaths = Array.from(new Set(objectPaths))
  if (uniquePaths.length === 0) return { ok: true }

  const result = await lookup(uniquePaths)
  if (result.error) {
    return { ok: false, error: 'Unable to validate local videos', status: 500 }
  }

  const finalized = new Set(result.objectPaths)
  if (uniquePaths.some((path) => !finalized.has(path))) {
    return {
      ok: false,
      error: 'Every local video must finish verification before the post can be saved',
      status: 400,
    }
  }

  return { ok: true }
}
