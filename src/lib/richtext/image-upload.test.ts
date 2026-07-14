import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { detectImageMime, MAX_IMAGE_SIZE, validateImageUpload } from './image-upload'

const signatures = {
  jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]),
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  gif: new TextEncoder().encode('GIF89a'),
  webp: new TextEncoder().encode('RIFF0000WEBP'),
}

describe('detectImageMime', () => {
  it('detects each supported raster signature', () => {
    assert.equal(detectImageMime(signatures.jpeg), 'image/jpeg')
    assert.equal(detectImageMime(signatures.png), 'image/png')
    assert.equal(detectImageMime(signatures.gif), 'image/gif')
    assert.equal(detectImageMime(signatures.webp), 'image/webp')
  })

  it('rejects SVG and arbitrary bytes', () => {
    assert.equal(detectImageMime(new TextEncoder().encode('<svg><script /></svg>')), null)
    assert.equal(detectImageMime(new Uint8Array([1, 2, 3, 4])), null)
  })
})

describe('validateImageUpload', () => {
  it('accepts a matching JPEG signature, MIME type, and extension', () => {
    assert.deepEqual(validateImageUpload({
      name: 'photo.jpeg',
      declaredMime: 'image/jpeg',
      size: signatures.jpeg.length,
      bytes: signatures.jpeg,
    }), { ok: true, mime: 'image/jpeg', extension: 'jpeg' })
  })

  it('rejects MIME spoofing', () => {
    const result = validateImageUpload({
      name: 'not-really.png',
      declaredMime: 'image/png',
      size: signatures.jpeg.length,
      bytes: signatures.jpeg,
    })
    assert.equal(result.ok, false)
  })

  it('rejects a mismatched extension', () => {
    const result = validateImageUpload({
      name: 'photo.gif',
      declaredMime: 'image/jpeg',
      size: signatures.jpeg.length,
      bytes: signatures.jpeg,
    })
    assert.equal(result.ok, false)
  })

  it('rejects empty and oversized images', () => {
    assert.equal(validateImageUpload({
      name: 'photo.png',
      declaredMime: 'image/png',
      size: 0,
      bytes: signatures.png,
    }).ok, false)

    assert.equal(validateImageUpload({
      name: 'photo.png',
      declaredMime: 'image/png',
      size: MAX_IMAGE_SIZE + 1,
      bytes: signatures.png,
    }).ok, false)
  })
})
