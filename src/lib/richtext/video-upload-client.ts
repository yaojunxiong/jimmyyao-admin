import {
  isApprovedSignedVideoUploadUrl,
  parseForumVideoPublicUrl,
  validateVideoUploadInput,
  type AllowedVideoMime,
  type ForumVideoReference,
} from './video-upload'

export type VideoUploadPhase = 'reserving' | 'uploading' | 'finalizing'

export type VideoUploadProgress = {
  phase: VideoUploadPhase
  percent: number
}

export type FinalizedForumVideo = ForumVideoReference & {
  fileSize: number
}

export type VideoReservation = {
  reservationId: string
  uploadPath: string
  signedUrl: string
  mimeType: AllowedVideoMime
  expiresAt: string
}

export type VideoFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type VideoXhrFactory = () => XMLHttpRequest

type UploadOptions = {
  onProgress?: (progress: VideoUploadProgress) => void
  fetchImpl?: VideoFetch
  xhrFactory?: VideoXhrFactory
}

type ApiEnvelope = {
  ok?: unknown
  error?: unknown
  data?: unknown
}

const RESERVATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FINALIZATION_ATTEMPTS = 3

class RetryableVideoApiError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function readJsonEnvelope(
  response: Response,
  fallbackError: string,
): Promise<ApiEnvelope> {
  const contentType = response.headers.get('content-type')?.toLowerCase() || ''
  if (!contentType.includes('application/json')) {
    const error = `${fallbackError}: the server returned a non-JSON response`
    if (response.status >= 500) throw new RetryableVideoApiError(error)
    throw new Error(error)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    const error = `${fallbackError}: the server returned invalid JSON`
    if (response.status >= 500) throw new RetryableVideoApiError(error)
    throw new Error(error)
  }

  if (!isRecord(payload)) {
    throw new Error(`${fallbackError}: the server returned an invalid response`)
  }

  if (!response.ok || payload.ok !== true) {
    const message = typeof payload.error === 'string' && payload.error.trim()
      ? payload.error
      : fallbackError
    if (response.status >= 500) throw new RetryableVideoApiError(message)
    throw new Error(message)
  }

  return payload
}

export async function reserveForumVideo(
  file: File,
  fetchImpl: VideoFetch = fetch,
): Promise<VideoReservation> {
  const validation = validateVideoUploadInput({
    name: file.name,
    declaredMime: file.type,
    size: file.size,
  })
  if (!validation.ok) throw new Error(validation.error)

  const response = await fetchImpl('/api/admin/forum/upload/video', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type,
    }),
  })

  const payload = await readJsonEnvelope(response, 'Could not authorize video upload')
  if (!isRecord(payload.data)) {
    throw new Error('Could not authorize video upload: missing reservation data')
  }

  const { reservationId, uploadPath, signedUrl, mimeType, expiresAt } = payload.data
  if (
    typeof reservationId !== 'string'
    || !RESERVATION_ID_PATTERN.test(reservationId)
    || typeof uploadPath !== 'string'
    || typeof signedUrl !== 'string'
    || mimeType !== validation.mime
    || typeof expiresAt !== 'string'
    || !Number.isFinite(Date.parse(expiresAt))
    || Date.parse(expiresAt) <= Date.now()
    || !isApprovedSignedVideoUploadUrl(signedUrl, uploadPath)
  ) {
    throw new Error('Could not authorize video upload: invalid reservation data')
  }

  return {
    reservationId,
    uploadPath,
    signedUrl,
    mimeType: validation.mime,
    expiresAt,
  }
}

export function uploadFileToSignedUrl(
  signedUrl: string,
  uploadPath: string,
  file: File,
  options: {
    onProgress?: (percent: number) => void
    xhrFactory?: VideoXhrFactory
  } = {},
): Promise<void> {
  if (!isApprovedSignedVideoUploadUrl(signedUrl, uploadPath)) {
    return Promise.reject(new Error('Storage upload authorization is invalid'))
  }

  const xhrFactory = options.xhrFactory || (() => new XMLHttpRequest())

  return new Promise((resolve, reject) => {
    const xhr = xhrFactory()
    xhr.open('PUT', signedUrl, true)
    xhr.withCredentials = false
    xhr.timeout = 30 * 60 * 1000
    xhr.setRequestHeader('x-upsert', 'false')

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return
      const percent = Math.min(
        100,
        Math.max(0, Math.round((event.loaded / event.total) * 100)),
      )
      options.onProgress?.(percent)
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(100)
        resolve()
        return
      }

      if (xhr.status === 409) {
        reject(new Error('Storage refused to overwrite an existing video'))
        return
      }

      reject(new Error('Direct Storage upload failed'))
    }
    xhr.onerror = () => {
      reject(new Error('Direct Storage upload failed because of a network error'))
    }
    xhr.onabort = () => {
      reject(new Error('Direct Storage upload was cancelled'))
    }
    xhr.ontimeout = () => {
      reject(new Error('Direct Storage upload timed out'))
    }

    const formData = new FormData()
    formData.append('cacheControl', '31536000')
    formData.append('', file)
    xhr.send(formData)
  })
}

async function finalizeForumVideoAttempt(
  reservation: VideoReservation,
  file: File,
  fetchImpl: VideoFetch = fetch,
): Promise<FinalizedForumVideo> {
  let response: Response
  try {
    response = await fetchImpl('/api/admin/forum/upload/video/finalize', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservationId: reservation.reservationId }),
    })
  } catch {
    throw new RetryableVideoApiError(
      'Could not finalize video upload because of a network error',
    )
  }

  const payload = await readJsonEnvelope(response, 'Could not finalize video upload')
  if (!isRecord(payload.data)) {
    throw new Error('Could not finalize video upload: missing video data')
  }

  const { publicUrl, objectPath, mimeType, fileSize } = payload.data
  const reference = typeof publicUrl === 'string'
    ? parseForumVideoPublicUrl(publicUrl)
    : null

  if (
    !reference
    || typeof objectPath !== 'string'
    || objectPath !== reference.objectPath
    || mimeType !== reference.mime
    || mimeType !== reservation.mimeType
    || typeof fileSize !== 'number'
    || !Number.isSafeInteger(fileSize)
    || fileSize !== file.size
  ) {
    throw new Error('Could not finalize video upload: invalid finalized video data')
  }

  return { ...reference, fileSize }
}

export async function finalizeForumVideo(
  reservation: VideoReservation,
  file: File,
  fetchImpl: VideoFetch = fetch,
): Promise<FinalizedForumVideo> {
  let lastError: unknown

  for (let attempt = 1; attempt <= FINALIZATION_ATTEMPTS; attempt += 1) {
    try {
      return await finalizeForumVideoAttempt(reservation, file, fetchImpl)
    } catch (error) {
      lastError = error
      if (!(error instanceof RetryableVideoApiError)) throw error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Could not finalize video upload')
}

export async function uploadForumVideo(
  file: File,
  options: UploadOptions = {},
): Promise<FinalizedForumVideo> {
  const validation = validateVideoUploadInput({
    name: file.name,
    declaredMime: file.type,
    size: file.size,
  })
  if (!validation.ok) throw new Error(validation.error)

  const fetchImpl = options.fetchImpl || fetch
  options.onProgress?.({ phase: 'reserving', percent: 0 })
  const reservation = await reserveForumVideo(file, fetchImpl)

  options.onProgress?.({ phase: 'uploading', percent: 0 })
  await uploadFileToSignedUrl(
    reservation.signedUrl,
    reservation.uploadPath,
    file,
    {
      xhrFactory: options.xhrFactory,
      onProgress: (percent) => {
        options.onProgress?.({ phase: 'uploading', percent })
      },
    },
  )

  options.onProgress?.({ phase: 'finalizing', percent: 100 })
  return finalizeForumVideo(reservation, file, fetchImpl)
}
