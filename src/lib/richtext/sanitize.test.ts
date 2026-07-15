import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeHtml } from './sanitize'

const approvedVideoUrl =
  'https://ycjuceortcduakxscfes.supabase.co/storage/v1/object/public/forum-videos/videos/7de72fea-5bb0-4b8a-a8ca-06ec2ffec947/2026/07/4a54a2f2-d662-4b5f-9fef-8bfbe8ebbd2b.mp4'

const productionOrigin = 'https://ycjuceortcduakxscfes.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_URL = productionOrigin
process.env.VERCEL_ENV = 'test'

describe('sanitizeHtml', () => {
  it('allows basic formatting tags', async () => {
    const result = await sanitizeHtml('<p>Hello <strong>world</strong></p>')
    assert.match(result.html, /<p>/)
    assert.match(result.html, /<strong>/)
    assert.match(result.html, /world/)
  })

  it('strips script tags', async () => {
    const result = await sanitizeHtml('<p>Hello</p><script>alert("xss")</script>')
    assert.doesNotMatch(result.html, /<script/)
    assert.match(result.html, /Hello/)
  })

  it('strips event handlers', async () => {
    const result = await sanitizeHtml('<p onclick="alert(1)">Hello</p>')
    assert.doesNotMatch(result.html, /onclick/i)
  })

  it('strips javascript: href', async () => {
    const result = await sanitizeHtml('<a href="javascript:alert(1)">click</a>')
    assert.doesNotMatch(result.html, /javascript/)
  })

  it('adds rel and target to links', async () => {
    const result = await sanitizeHtml('<a href="https://example.com">link</a>')
    assert.match(result.html, /rel="noopener noreferrer nofollow"/)
    assert.match(result.html, /target="_blank"/)
  })

  it('allows safe image tags', async () => {
    const result = await sanitizeHtml('<img src="https://example.com/image.jpg" alt="test">')
    assert.match(result.html, /<img/)
    assert.match(result.html, /src="https:\/\/example\.com\/image\.jpg"/)
  })

  it('removes images with no src', async () => {
    const result = await sanitizeHtml('<img alt="test">')
    assert.doesNotMatch(result.html, /<img/)
  })

  it('strips data: URI in img src', async () => {
    const result = await sanitizeHtml('<img src="data:image/png;base64,abc">')
    assert.doesNotMatch(result.html, /<img/)
  })

  it('strips unknown tags', async () => {
    const result = await sanitizeHtml('<p>Hello</p><marquee>scroll</marquee>')
    assert.doesNotMatch(result.html, /marquee/i)
  })

  it('allows blockquote', async () => {
    const result = await sanitizeHtml('<blockquote><p>Quote</p></blockquote>')
    assert.match(result.html, /blockquote/)
  })

  it('allows lists', async () => {
    const result = await sanitizeHtml('<ul><li>Item</li></ul><ol><li>One</li></ol>')
    assert.match(result.html, /<ul>/)
    assert.match(result.html, /<ol>/)
    assert.match(result.html, /<li>/)
  })

  it('allows headings', async () => {
    const result = await sanitizeHtml('<h1>Title</h1><h2>Sub</h2><h3>Subsub</h3>')
    assert.match(result.html, /<h1>/)
    assert.match(result.html, /<h2>/)
    assert.match(result.html, /<h3>/)
  })

  it('allows code and pre', async () => {
    const result = await sanitizeHtml('<pre><code>const x = 1;</code></pre>')
    assert.match(result.html, /<pre>/)
    assert.match(result.html, /<code>/)
  })

  it('allows youtube iframe and converts to safe embed', async () => {
    const result = await sanitizeHtml('<iframe src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" width="560" height="315"></iframe>')
    assert.match(result.html, /youtube-nocookie\.com\/embed/)
    assert.match(result.html, /allowfullscreen/)
  })

  it('allows vimeo iframe', async () => {
    const result = await sanitizeHtml('<iframe src="https://player.vimeo.com/video/123456789" width="560" height="315"></iframe>')
    assert.match(result.html, /player\.vimeo\.com/)
  })

  it('rejects arbitrary iframe domains', async () => {
    const result = await sanitizeHtml('<iframe src="https://evil.example.com/malware"></iframe>')
    assert.doesNotMatch(result.html, /iframe/)
  })

  it('rejects iframe with javascript src', async () => {
    const result = await sanitizeHtml('<iframe src="javascript:alert(1)"></iframe>')
    assert.doesNotMatch(result.html, /iframe/)
  })

  it('extracts plain text correctly', async () => {
    const result = await sanitizeHtml('<p>Hello <strong>world</strong></p><p>Second paragraph</p>')
    assert.equal(result.text, 'Hello world Second paragraph')
  })

  it('handles empty input', async () => {
    const result = await sanitizeHtml('')
    assert.equal(result.html, '')
    assert.equal(result.text, '')
  })

  it('allows strikethrough', async () => {
    const result = await sanitizeHtml('<p><s>deleted</s> <del>gone</del> <strike>struck</strike></p>')
    assert.match(result.html, /<s>/)
    assert.match(result.html, /<del>/)
  })

  it('strips all attributes except allowed ones', async () => {
    const result = await sanitizeHtml('<p style="color:red" data-xyz="foo">Hello</p>')
    assert.doesNotMatch(result.html, /data-xyz/)
    assert.match(result.html, /Hello/)
  })

  it('strips arbitrary class names', async () => {
    const result = await sanitizeHtml('<p class="test">Hello</p>')
    assert.doesNotMatch(result.html, /class=/)
  })

  it('strips iframe without valid video domain', async () => {
    const result = await sanitizeHtml('<iframe src="https://example.com"></iframe>')
    assert.doesNotMatch(result.html, /iframe/)
  })

  it('rejects youtube.com.evil.com subdomain attack', async () => {
    const result = await sanitizeHtml('<iframe src="https://www.youtube.com.evil.com/malware"></iframe>')
    assert.doesNotMatch(result.html, /iframe/)
  })

  it('rejects y0utube.com homograph', async () => {
    const result = await sanitizeHtml('<iframe src="https://www.y0utube.com/watch?v=dQw4w9WgXcQ"></iframe>')
    assert.doesNotMatch(result.html, /iframe/)
  })

  it('rejects mixed-case javascript URL', async () => {
    const result = await sanitizeHtml('<a href="JaVaScRiPt:alert(1)">click</a>')
    assert.doesNotMatch(result.html, /href=/)
  })

  it('rejects encoded javascript URL after JSDOM decoding', async () => {
    const result = await sanitizeHtml('<a href="&#106;avascript:alert(1)">click</a>')
    assert.doesNotMatch(result.html, /href=/)
  })

  it('rejects data URI as img src', async () => {
    const result = await sanitizeHtml('<img src="data:image/svg+xml,<script>alert(1)</script>">')
    assert.doesNotMatch(result.html, /<img/)
  })

  it('rejects vbscript URL', async () => {
    const result = await sanitizeHtml('<a href="vbscript:msgbox(1)">click</a>')
    assert.doesNotMatch(result.html, /href=/)
  })

  it('rejects file URL', async () => {
    const result = await sanitizeHtml('<a href="file:///etc/passwd">click</a>')
    assert.doesNotMatch(result.html, /href=/)
  })

  it('allows valid youtube.com/watch URL', async () => {
    const result = await sanitizeHtml('<iframe src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"></iframe>')
    assert.match(result.html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/)
  })

  it('allows youtu.be short URL', async () => {
    const result = await sanitizeHtml('<iframe src="https://youtu.be/dQw4w9WgXcQ"></iframe>')
    assert.match(result.html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/)
  })

  it('allows vimeo.com numeric URL', async () => {
    const result = await sanitizeHtml('<iframe src="https://vimeo.com/123456789"></iframe>')
    assert.match(result.html, /player\.vimeo\.com\/video\/123456789/)
  })

  it('allows youtube.com embed URL directly', async () => {
    const result = await sanitizeHtml('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>')
    assert.match(result.html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/)
  })

  it('rejects youtube video ID that is not 11 chars', async () => {
    const result = await sanitizeHtml('<iframe src="https://www.youtube.com/watch?v=too-short"></iframe>')
    assert.doesNotMatch(result.html, /iframe/)
  })

  it('does not remove href for valid https link', async () => {
    const result = await sanitizeHtml('<a href="https://example.com/page">link</a>')
    assert.match(result.html, /href="https:\/\/example\.com\/page"/)
  })

  it('allows mailto: links', async () => {
    const result = await sanitizeHtml('<a href="mailto:test@example.com">email</a>')
    assert.match(result.html, /href="mailto/)
  })

  it('does not crash on empty body with only disallowed tags', async () => {
    const result = await sanitizeHtml('<script></script><style></style>')
    assert.equal(result.html, '')
  })

  it('does not crash on deeply nested disallowed tags', async () => {
    const result = await sanitizeHtml('<div><div><div><p>Hello</p></div></div></div>')
    // div is allowed, so it should be preserved
    assert.match(result.html, /Hello/)
  })

  it('strips onerror and onload from img tags', async () => {
    const result = await sanitizeHtml('<img src="https://example.com/img.jpg" onerror="alert(1)" onload="evil()">')
    assert.match(result.html, /src="https:\/\/example\.com\/img\.jpg"/)
    assert.doesNotMatch(result.html, /onerror/i)
    assert.doesNotMatch(result.html, /onload/i)
  })

  it('canonicalizes an approved finalized local video for safe HTML5 playback', async () => {
    const result = await sanitizeHtml(
      `<p>Lesson</p><video src="${approvedVideoUrl}" autoplay loop muted poster="https://evil.test/poster.jpg"><source src="https://evil.test/movie.mp4"></video>`,
    )
    assert.equal(result.videos.length, 1)
    assert.equal(result.videos[0].publicUrl, approvedVideoUrl)
    assert.match(result.html, /<video/)
    assert.match(result.html, /controls=""/)
    assert.match(result.html, /preload="metadata"/)
    assert.match(result.html, /playsinline=""/)
    assert.match(result.html, /data-forum-video=""/)
    assert.match(result.html, /class="forum-local-video"/)
    assert.ok(result.html.includes(
      `<video src="${approvedVideoUrl}" controls="" preload="metadata" playsinline="" data-forum-video="" class="forum-local-video"></video>`,
    ))
    assert.doesNotMatch(result.html, /autoplay|loop|muted|poster|<source/i)
  })

  it('rejects a local video from any other Storage origin or reservation path', async () => {
    const badOrigin = approvedVideoUrl.replace(
      'ycjuceortcduakxscfes.supabase.co',
      'ycjuceortcduakxscfes.supabase.co.evil.test',
    )
    const reserved = approvedVideoUrl.replace('/videos/', '/reservations/')
    const result = await sanitizeHtml(
      `<p>Keep this text</p><video src="${badOrigin}" controls></video><video src="${reserved}" controls></video>`,
    )
    assert.equal(result.videos.length, 0)
    assert.doesNotMatch(result.html, /<video/i)
    assert.match(result.html, /Keep this text/)
  })

  it('strips event handlers and scripting attributes from an approved local video', async () => {
    const result = await sanitizeHtml(
      `<p>Safe</p><video src="${approvedVideoUrl}" onplay="alert(1)" onclick="evil()" autoplay></video>`,
    )
    assert.equal(result.videos.length, 1)
    assert.doesNotMatch(result.html, /onplay|onclick|autoplay/i)
  })

  it('accepts an alternate configured project and rejects origin mismatches', async () => {
    const alternateOrigin = 'https://abcdefghijklmnopqrst.supabase.co'
    const alternateVideoUrl = approvedVideoUrl.replace(
      productionOrigin,
      alternateOrigin,
    )
    process.env.NEXT_PUBLIC_SUPABASE_URL = alternateOrigin
    try {
      const accepted = await sanitizeHtml(
        `<p>Alternate</p><video src="${alternateVideoUrl}"></video>`,
      )
      const rejected = await sanitizeHtml(
        `<p>Production mismatch</p><video src="${approvedVideoUrl}"></video>`,
      )
      assert.equal(accepted.videos.length, 1)
      assert.equal(rejected.videos.length, 0)
      assert.doesNotMatch(rejected.html, /<video/i)
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = productionOrigin
    }
  })

  it('fails closed for local video when origin config is missing without breaking other rich media', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    try {
      const result = await sanitizeHtml(
        `<p>Keep</p><img src="https://example.com/image.png"><video src="${approvedVideoUrl}"></video><iframe src="https://youtu.be/dQw4w9WgXcQ"></iframe>`,
      )
      assert.equal(result.videos.length, 0)
      assert.doesNotMatch(result.html, /<video/i)
      assert.match(result.html, /<img/)
      assert.match(result.html, /youtube-nocookie[.]com/)
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = productionOrigin
    }
  })
})
