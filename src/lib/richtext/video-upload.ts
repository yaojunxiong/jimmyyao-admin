import {
  getConfiguredSupabaseProjectOrigin,
  normalizeSupabaseProjectOrigin,
} from '@/lib/supabase/config'

export const FORUM_VIDEO_BUCKET = 'forum-videos'
export const FORUM_VIDEO_PUBLIC_PATH_PREFIX =
  `/storage/v1/object/public/${FORUM_VIDEO_BUCKET}/`

export const MAX_VIDEO_SIZE = 50 * 1024 * 1024
export const MAX_VIDEO_FILENAME_LENGTH = 255
export const MAX_VIDEOS_PER_POST = 3
export const MAX_VIDEOS_PER_HOUR = 10
export const VIDEO_RESERVATION_LIFETIME_MS = 2 * 60 * 60 * 1000
export const VIDEO_SIGNATURE_BYTES = 4096

export const VIDEO_MIME_EXTENSIONS = {
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
} as const

export type AllowedVideoMime = keyof typeof VIDEO_MIME_EXTENSIONS

export type ForumVideoReference = {
  mime: AllowedVideoMime
  objectPath: string
  publicUrl: string
}

const UUID_PATTERN =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const VIDEO_SUFFIX_PATTERN =
  `${UUID_PATTERN}/[0-9]{4}/(?:0[1-9]|1[0-2])/${UUID_PATTERN}\\.(mp4|webm)`
const FINAL_OBJECT_PATH = new RegExp(`^videos/${VIDEO_SUFFIX_PATTERN}$`)
const RESERVED_OBJECT_PATH = new RegExp(`^reservations/${VIDEO_SUFFIX_PATTERN}$`)

export function isAllowedVideoMime(mime: string): mime is AllowedVideoMime {
  return Object.hasOwn(VIDEO_MIME_EXTENSIONS, mime)
}

export function buildVideoPaths(
  adminId: string,
  mime: AllowedVideoMime,
  now = new Date(),
  uuid = crypto.randomUUID(),
): { uploadPath: string; objectPath: string; extension: string } {
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const extension = VIDEO_MIME_EXTENSIONS[mime][0]
  const suffix = `${adminId}/${yyyy}/${mm}/${uuid}.${extension}`

  return {
    uploadPath: `reservations/${suffix}`,
    objectPath: `videos/${suffix}`,
    extension,
  }
}

export function getExtensionFromName(name: string): string {
  return name.split('.').pop()?.toLowerCase() || ''
}

export function validateVideoUploadInput(input: {
  name: string
  declaredMime: string
  size: number
}):
  | { ok: true; mime: AllowedVideoMime; extension: string }
  | { ok: false; error: string }
{
  if (
    input.name.length > MAX_VIDEO_FILENAME_LENGTH
    || input.name !== input.name.trim()
    || /[\\/\u0000-\u001f\u007f]/.test(input.name)
  ) {
    return { ok: false, error: 'The video filename is invalid or too long' }
  }

  if (!Number.isSafeInteger(input.size) || input.size < 1) {
    return { ok: false, error: 'The file is empty or has an invalid size' }
  }

  if (input.size > MAX_VIDEO_SIZE) {
    return {
      ok: false,
      error: `Video is too large (maximum ${MAX_VIDEO_SIZE / 1024 / 1024} MB)`,
    }
  }

  if (!isAllowedVideoMime(input.declaredMime)) {
    return { ok: false, error: 'Unsupported video format. Only MP4 and WebM are allowed.' }
  }

  const extension = getExtensionFromName(input.name)
  const allowedExtensions = VIDEO_MIME_EXTENSIONS[input.declaredMime]
  if (!(allowedExtensions as readonly string[]).includes(extension)) {
    return {
      ok: false,
      error: `Filename extension .${extension || '(none)'} does not match the declared type ${input.declaredMime}`,
    }
  }

  return { ok: true, mime: input.declaredMime, extension }
}

const MP4_FTYP_SIGNATURE = [0x66, 0x74, 0x79, 0x70] as const
const WEBM_EBML_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3] as const
const WEBM_DOCTYPE = [0x77, 0x65, 0x62, 0x6d] as const

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[index + offset] === value)
}

function includesBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false

  for (let offset = 0; offset <= bytes.length - signature.length; offset += 1) {
    if (startsWith(bytes, signature, offset)) return true
  }

  return false
}

export function detectVideoMime(bytes: Uint8Array): AllowedVideoMime | null {
  if (bytes.length >= 12 && startsWith(bytes, MP4_FTYP_SIGNATURE, 4)) {
    return 'video/mp4'
  }

  if (
    bytes.length >= 8
    && startsWith(bytes, WEBM_EBML_SIGNATURE)
    && includesBytes(bytes, WEBM_DOCTYPE)
  ) {
    return 'video/webm'
  }

  return null
}

function mimeFromExtension(extension: string): AllowedVideoMime | null {
  if (extension.toLowerCase() === 'mp4') return 'video/mp4'
  if (extension.toLowerCase() === 'webm') return 'video/webm'
  return null
}

function parseCanonicalPublicUrl(
  rawUrl: string,
  pathPattern: RegExp,
  approvedOrigin: string | null,
): ForumVideoReference | null {
  if (!approvedOrigin) return null

  try {
    const url = new URL(rawUrl)
    if (
      url.origin !== approvedOrigin
      || url.username
      || url.password
      || url.search
      || url.hash
      || url.pathname.includes('%')
      || !url.pathname.startsWith(FORUM_VIDEO_PUBLIC_PATH_PREFIX)
    ) {
      return null
    }

    const objectPath = url.pathname.slice(FORUM_VIDEO_PUBLIC_PATH_PREFIX.length)
    const match = pathPattern.exec(objectPath)
    const mime = match ? mimeFromExtension(match[1]) : null
    if (!mime) return null

    const publicUrl = `${approvedOrigin}${FORUM_VIDEO_PUBLIC_PATH_PREFIX}${objectPath}`
    if (rawUrl !== publicUrl) return null

    return {
      mime,
      objectPath,
      publicUrl,
    }
  } catch {
    return null
  }
}

export function parseForumVideoPublicUrl(rawUrl: string): ForumVideoReference | null {
  return parseCanonicalPublicUrl(
    rawUrl,
    FINAL_OBJECT_PATH,
    getConfiguredSupabaseProjectOrigin(),
  )
}

export function parseForumVideoPublicUrlForOrigin(
  rawUrl: string,
  configuredOrigin: string | null,
): ForumVideoReference | null {
  const approvedOrigin = normalizeSupabaseProjectOrigin(configuredOrigin)
  return parseCanonicalPublicUrl(rawUrl, FINAL_OBJECT_PATH, approvedOrigin)
}

export function parseReservedForumVideoPublicUrl(rawUrl: string): ForumVideoReference | null {
  return parseCanonicalPublicUrl(
    rawUrl,
    RESERVED_OBJECT_PATH,
    getConfiguredSupabaseProjectOrigin(),
  )
}

export function buildForumVideoPublicUrl(objectPath: string): string | null {
  const approvedOrigin = getConfiguredSupabaseProjectOrigin()
  if (!approvedOrigin) return null
  const rawUrl = `${approvedOrigin}${FORUM_VIDEO_PUBLIC_PATH_PREFIX}${objectPath}`
  return parseForumVideoPublicUrl(rawUrl)?.publicUrl || null
}

export function buildReservedForumVideoPublicUrl(uploadPath: string): string | null {
  const approvedOrigin = getConfiguredSupabaseProjectOrigin()
  if (!approvedOrigin) return null
  const rawUrl = `${approvedOrigin}${FORUM_VIDEO_PUBLIC_PATH_PREFIX}${uploadPath}`
  return parseReservedForumVideoPublicUrl(rawUrl)?.publicUrl || null
}

export function isApprovedSignedVideoUploadUrl(
  rawUrl: string,
  expectedUploadPath: string,
): boolean {
  if (!RESERVED_OBJECT_PATH.test(expectedUploadPath)) return false
  const approvedOrigin = getConfiguredSupabaseProjectOrigin()
  if (!approvedOrigin) return false

  try {
    const url = new URL(rawUrl)
    const expectedPath = `/storage/v1/object/upload/sign/${FORUM_VIDEO_BUCKET}/${expectedUploadPath}`
    const queryKeys = Array.from(url.searchParams.keys())

    return url.origin === approvedOrigin
      && !url.username
      && !url.password
      && !url.hash
      && !url.pathname.includes('%')
      && url.pathname === expectedPath
      && queryKeys.length === 1
      && queryKeys[0] === 'token'
      && Boolean(url.searchParams.get('token'))
  } catch {
    return false
  }
}

type TipTapObject = Record<string, unknown>

function isRecord(value: unknown): value is TipTapObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function collectTipTapLocalVideos(input: unknown):
  | { ok: true; videos: ForumVideoReference[] }
  | { ok: false; error: string }
{
  const videos: ForumVideoReference[] = []
  let invalid = false

  function visit(value: unknown) {
    if (invalid) return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (!isRecord(value)) return

    if (value.type === 'localVideo') {
      const attrs = isRecord(value.attrs) ? value.attrs : null
      const src = attrs && typeof attrs.src === 'string' ? attrs.src : ''
      const mimeType = attrs && typeof attrs.mimeType === 'string' ? attrs.mimeType : ''
      const video = parseForumVideoPublicUrl(src)

      if (!video || mimeType !== video.mime) {
        invalid = true
        return
      }

      videos.push(video)
    }

    for (const child of Object.values(value)) visit(child)
  }

  visit(input)

  if (invalid) {
    return { ok: false, error: 'TipTap contains an invalid local video node' }
  }

  if (videos.length > MAX_VIDEOS_PER_POST) {
    return { ok: false, error: `A post may contain at most ${MAX_VIDEOS_PER_POST} local videos` }
  }

  return { ok: true, videos }
}

export function haveMatchingVideoReferences(
  left: readonly ForumVideoReference[],
  right: readonly ForumVideoReference[],
): boolean {
  if (left.length !== right.length) return false

  const normalize = (videos: readonly ForumVideoReference[]) =>
    videos.map((video) => `${video.objectPath}\u0000${video.mime}`).sort()
  const leftValues = normalize(left)
  const rightValues = normalize(right)

  return leftValues.every((value, index) => value === rightValues[index])
}
