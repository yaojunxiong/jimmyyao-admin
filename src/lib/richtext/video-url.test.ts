import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeVideoEmbedUrl } from './video-url'

describe('normalizeVideoEmbedUrl', () => {
  it('normalizes supported YouTube URLs to the privacy-enhanced host', () => {
    assert.deepEqual(
      normalizeVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      {
        provider: 'youtube',
        src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      },
    )
    assert.equal(
      normalizeVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ')?.provider,
      'youtube',
    )
  })

  it('normalizes supported Vimeo URLs', () => {
    assert.deepEqual(normalizeVideoEmbedUrl('https://vimeo.com/123456789'), {
      provider: 'vimeo',
      src: 'https://player.vimeo.com/video/123456789',
    })
  })

  it('requires HTTPS and exact hosts/paths', () => {
    assert.equal(normalizeVideoEmbedUrl('file://youtube.com/embed/dQw4w9WgXcQ'), null)
    assert.equal(normalizeVideoEmbedUrl('https://youtube.com.evil.example/embed/dQw4w9WgXcQ'), null)
    assert.equal(normalizeVideoEmbedUrl('https://player.vimeo.com/malware/123456789'), null)
    assert.equal(normalizeVideoEmbedUrl('https://vimeo.com/123456789/extra'), null)
  })
})
