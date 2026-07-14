export const MAX_IMAGE_SIZE = 4 * 1024 * 1024

export const IMAGE_MIME_EXTENSIONS = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
} as const

export type AllowedImageMime = keyof typeof IMAGE_MIME_EXTENSIONS

type ImageValidationInput = {
  name: string
  declaredMime: string
  size: number
  bytes: Uint8Array
}

type ImageValidationResult =
  | { ok: true; mime: AllowedImageMime; extension: string }
  | { ok: false; error: string }

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

export function detectImageMime(bytes: Uint8Array): AllowedImageMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png'
  }

  const header = new TextDecoder('ascii').decode(bytes.slice(0, 12))
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return 'image/gif'
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') return 'image/webp'

  return null
}

export function validateImageUpload(input: ImageValidationInput): ImageValidationResult {
  if (input.size < 1) return { ok: false, error: 'The image is empty' }
  if (input.size > MAX_IMAGE_SIZE) {
    return { ok: false, error: 'Image is too large (maximum 4 MB)' }
  }

  if (!(input.declaredMime in IMAGE_MIME_EXTENSIONS)) {
    return { ok: false, error: 'Unsupported image MIME type' }
  }

  const detectedMime = detectImageMime(input.bytes)
  if (!detectedMime || detectedMime !== input.declaredMime) {
    return { ok: false, error: 'File contents do not match the declared image type' }
  }

  const extension = input.name.split('.').pop()?.toLowerCase() || ''
  const allowedExtensions = IMAGE_MIME_EXTENSIONS[detectedMime]
  if (!(allowedExtensions as readonly string[]).includes(extension)) {
    return { ok: false, error: 'Filename extension does not match the image type' }
  }

  return { ok: true, mime: detectedMime, extension }
}
