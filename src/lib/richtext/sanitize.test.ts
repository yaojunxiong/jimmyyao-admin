import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeHtml } from './sanitize'

describe('sanitizeHtml', () => {
  it('allows basic formatting tags', () => {
    const result = sanitizeHtml('<p>Hello <strong>world</strong></p>')
    assert.match(result.html, /<p>/)
    assert.match(result.html, /<strong>/)
    assert.match(result.html, /world/)
  })

  it('strips script tags', () => {
    const result = sanitizeHtml('<p>Hello</p><script>alert("xss")</script>')
    assert.doesNotMatch(result.html, /<script/)
    assert.match(result.html, /Hello/)
  })

  it('strips event handlers', () => {
    const result = sanitizeHtml('<p onclick="alert(1)">Hello</p>')
    assert.doesNotMatch(result.html, /onclick/i)
  })

  it('strips javascript: href', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>')
    assert.doesNotMatch(result.html, /javascript/)
  })

  it('adds rel and target to links', () => {
    const result = sanitizeHtml('<a href="https://example.com">link</a>')
    assert.match(result.html, /rel="noopener noreferrer nofollow"/)
    assert.match(result.html, /target="_blank"/)
  })

  it('allows safe image tags', () => {
    const result = sanitizeHtml('<img src="https://example.com/image.jpg" alt="test">')
    assert.match(result.html, /<img/)
    assert.match(result.html, /src="https:\/\/example\.com\/image\.jpg"/)
  })

  it('removes images with no src', () => {
    const result = sanitizeHtml('<img alt="test">')
    assert.doesNotMatch(result.html, /<img/)
  })

  it('strips data: URI in img src', () => {
    const result = sanitizeHtml('<img src="data:image/png;base64,abc">')
    assert.doesNotMatch(result.html, /<img/)
  })

  it('strips unknown tags', () => {
    const result = sanitizeHtml('<p>Hello</p><marquee>scroll</marquee>')
    assert.doesNotMatch(result.html, /marquee/i)
  })

  it('allows blockquote', () => {
    const result = sanitizeHtml('<blockquote><p>Quote</p></blockquote>')
    assert.match(result.html, /blockquote/)
  })

  it('allows lists', () => {
    const result = sanitizeHtml('<ul><li>Item</li></ul><ol><li>One</li></ol>')
    assert.match(result.html, /<ul>/)
    assert.match(result.html, /<ol>/)
    assert.match(result.html, /<li>/)
  })

  it('allows headings', () => {
    const result = sanitizeHtml('<h1>Title</h1><h2>Sub</h2><h3>Subsub</h3>')
    assert.match(result.html, /<h1>/)
    assert.match(result.html, /<h2>/)
    assert.match(result.html, /<h3>/)
  })

  it('allows code and pre', () => {
    const result = sanitizeHtml('<pre><code>const x = 1;</code></pre>')
    assert.match(result.html, /<pre>/)
    assert.match(result.html, /<code>/)
  })

  it('allows youtube iframe and converts to safe embed', () => {
    const result = sanitizeHtml('<iframe src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" width="560" height="315"></iframe>')
    assert.match(result.html, /youtube-nocookie\.com\/embed/)
    assert.match(result.html, /allowfullscreen/)
  })

  it('allows vimeo iframe', () => {
    const result = sanitizeHtml('<iframe src="https://player.vimeo.com/video/123456789" width="560" height="315"></iframe>')
    assert.match(result.html, /player\.vimeo\.com/)
  })

  it('rejects arbitrary iframe domains', () => {
    const result = sanitizeHtml('<iframe src="https://evil.example.com/malware"></iframe>')
    assert.doesNotMatch(result.html, /iframe/)
  })

  it('rejects iframe with javascript src', () => {
    const result = sanitizeHtml('<iframe src="javascript:alert(1)"></iframe>')
    assert.doesNotMatch(result.html, /iframe/)
  })

  it('extracts plain text correctly', () => {
    const result = sanitizeHtml('<p>Hello <strong>world</strong></p><p>Second paragraph</p>')
    assert.equal(result.text, 'Hello world Second paragraph')
  })

  it('handles empty input', () => {
    const result = sanitizeHtml('')
    assert.equal(result.html, '')
    assert.equal(result.text, '')
  })

  it('allows strikethrough', () => {
    const result = sanitizeHtml('<p><s>deleted</s> <del>gone</del> <strike>struck</strike></p>')
    assert.match(result.html, /<s>/)
    assert.match(result.html, /<del>/)
  })

  it('strips all attributes except allowed ones', () => {
    const result = sanitizeHtml('<p style="color:red" data-xyz="foo">Hello</p>')
    assert.doesNotMatch(result.html, /data-xyz/)
    assert.match(result.html, /Hello/)
  })

  it('strips arbitrary class names', () => {
    const result = sanitizeHtml('<p class="test">Hello</p>')
    assert.doesNotMatch(result.html, /class=/)
  })

  it('strips iframe without valid video domain', () => {
    const result = sanitizeHtml('<iframe src="https://example.com"></iframe>')
    assert.doesNotMatch(result.html, /iframe/)
  })

  it('rejects youtube.com.evil.com subdomain attack', () => {
    const result = sanitizeHtml('<iframe src="https://www.youtube.com.evil.com/malware"></iframe>')
    assert.doesNotMatch(result.html, /iframe/)
  })

  it('rejects y0utube.com homograph', () => {
    const result = sanitizeHtml('<iframe src="https://www.y0utube.com/watch?v=dQw4w9WgXcQ"></iframe>')
    assert.doesNotMatch(result.html, /iframe/)
  })

  it('rejects mixed-case javascript URL', () => {
    const result = sanitizeHtml('<a href="JaVaScRiPt:alert(1)">click</a>')
    assert.doesNotMatch(result.html, /href=/)
  })

  it('rejects encoded javascript URL after JSDOM decoding', () => {
    const result = sanitizeHtml('<a href="&#106;avascript:alert(1)">click</a>')
    assert.doesNotMatch(result.html, /href=/)
  })

  it('rejects data URI as img src', () => {
    const result = sanitizeHtml('<img src="data:image/svg+xml,<script>alert(1)</script>">')
    assert.doesNotMatch(result.html, /<img/)
  })

  it('rejects vbscript URL', () => {
    const result = sanitizeHtml('<a href="vbscript:msgbox(1)">click</a>')
    assert.doesNotMatch(result.html, /href=/)
  })

  it('rejects file URL', () => {
    const result = sanitizeHtml('<a href="file:///etc/passwd">click</a>')
    assert.doesNotMatch(result.html, /href=/)
  })

  it('allows valid youtube.com/watch URL', () => {
    const result = sanitizeHtml('<iframe src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"></iframe>')
    assert.match(result.html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/)
  })

  it('allows youtu.be short URL', () => {
    const result = sanitizeHtml('<iframe src="https://youtu.be/dQw4w9WgXcQ"></iframe>')
    assert.match(result.html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/)
  })

  it('allows vimeo.com numeric URL', () => {
    const result = sanitizeHtml('<iframe src="https://vimeo.com/123456789"></iframe>')
    assert.match(result.html, /player\.vimeo\.com\/video\/123456789/)
  })

  it('allows youtube.com embed URL directly', () => {
    const result = sanitizeHtml('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>')
    assert.match(result.html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/)
  })

  it('rejects youtube video ID that is not 11 chars', () => {
    const result = sanitizeHtml('<iframe src="https://www.youtube.com/watch?v=too-short"></iframe>')
    assert.doesNotMatch(result.html, /iframe/)
  })

  it('does not remove href for valid https link', () => {
    const result = sanitizeHtml('<a href="https://example.com/page">link</a>')
    assert.match(result.html, /href="https:\/\/example\.com\/page"/)
  })

  it('allows mailto: links', () => {
    const result = sanitizeHtml('<a href="mailto:test@example.com">email</a>')
    assert.match(result.html, /href="mailto/)
  })

  it('does not crash on empty body with only disallowed tags', () => {
    const result = sanitizeHtml('<script></script><style></style>')
    assert.equal(result.html, '')
  })

  it('does not crash on deeply nested disallowed tags', () => {
    const result = sanitizeHtml('<div><div><div><p>Hello</p></div></div></div>')
    // div is allowed, so it should be preserved
    assert.match(result.html, /Hello/)
  })

  it('strips onerror and onload from img tags', () => {
    const result = sanitizeHtml('<img src="https://example.com/img.jpg" onerror="alert(1)" onload="evil()">')
    assert.match(result.html, /src="https:\/\/example\.com\/img\.jpg"/)
    assert.doesNotMatch(result.html, /onerror/i)
    assert.doesNotMatch(result.html, /onload/i)
  })
})
