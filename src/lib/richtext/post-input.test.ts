import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_POST_BODY_LENGTH, preparePostInput } from './post-input'

const base = {
  title: 'Admin post',
  category: 'grammar',
}

const approvedVideoUrl =
  'https://ycjuceortcduakxscfes.supabase.co/storage/v1/object/public/forum-videos/videos/7de72fea-5bb0-4b8a-a8ca-06ec2ffec947/2026/07/4a54a2f2-d662-4b5f-9fef-8bfbe8ebbd2b.mp4'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ycjuceortcduakxscfes.supabase.co'
process.env.VERCEL_ENV = 'test'

describe('preparePostInput', () => {
  it('preserves the ordinary plain-text contract', async () => {
    const result = await preparePostInput({
      ...base,
      body: 'Legacy text',
      content_format: 'plain_text',
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.body, 'Legacy text')
      assert.equal(result.value.contentHtml, null)
      assert.deepEqual(result.value.forumVideoPaths, [])
    }
  })

  it('uses sanitized server-extracted text as the rich-text fallback body', async () => {
    const result = await preparePostInput({
      ...base,
      body: 'client-controlled fallback',
      content_format: 'rich_text',
      content_json: { type: 'doc', content: [] },
      content_html: '<h1>Hello</h1><script>alert(1)</script><p>World</p>',
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.body, 'Hello World')
      assert.doesNotMatch(result.value.contentHtml || '', /script|alert/i)
    }
  })

  it('rejects unknown formats and empty sanitized rich text', async () => {
    assert.equal((await preparePostInput({
      ...base,
      body: 'text',
      content_format: 'html',
    })).ok, false)

    assert.equal((await preparePostInput({
      ...base,
      body: 'text',
      content_format: 'rich_text',
      content_json: { type: 'doc' },
      content_html: '<script>alert(1)</script>',
    })).ok, false)
  })

  it('enforces the live forum body limit', async () => {
    assert.equal((await preparePostInput({
      ...base,
      body: 'x'.repeat(MAX_POST_BODY_LENGTH + 1),
      content_format: 'plain_text',
    })).ok, false)
  })

  it('rejects whitespace-only plain text', async () => {
    assert.equal((await preparePostInput({
      ...base,
      body: '   \n  ',
      content_format: 'plain_text',
    })).ok, false)
  })

  it('preserves a finalized local video across rich-text create/edit preparation', async () => {
    const input = {
      ...base,
      body: 'Lesson video',
      content_format: 'rich_text',
      content_json: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Lesson video' }] },
          { type: 'localVideo', attrs: { src: approvedVideoUrl, mimeType: 'video/mp4' } },
        ],
      },
      content_html: `<p>Lesson video</p><video src="${approvedVideoUrl}" controls preload="metadata"></video>`,
    }

    const created = await preparePostInput(input, {
      localVideoUploadEnabled: true,
    })
    assert.equal(created.ok, true)
    if (!created.ok) return
    assert.deepEqual(created.value.forumVideoPaths, [
      'videos/7de72fea-5bb0-4b8a-a8ca-06ec2ffec947/2026/07/4a54a2f2-d662-4b5f-9fef-8bfbe8ebbd2b.mp4',
    ])
    assert.match(created.value.contentHtml || '', /preload="metadata"/)

    const edited = await preparePostInput(
      {
        ...input,
        title: 'Edited admin post',
        content_json: created.value.contentJson,
        content_html: created.value.contentHtml,
      },
      {
        localVideoUploadEnabled: false,
        existingForumVideoPaths: created.value.forumVideoPaths,
      },
    )
    assert.equal(edited.ok, true)
    if (edited.ok) {
      assert.deepEqual(edited.value.forumVideoPaths, created.value.forumVideoPaths)
      assert.match(edited.value.contentHtml || '', /data-forum-video/)
    }
  })

  it('blocks new local videos while the independent video flag is disabled', async () => {
    const result = await preparePostInput({
      ...base,
      body: 'Lesson video',
      content_format: 'rich_text',
      content_json: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Lesson video' }] },
          { type: 'localVideo', attrs: { src: approvedVideoUrl, mimeType: 'video/mp4' } },
        ],
      },
      content_html: `<p>Lesson video</p><video src="${approvedVideoUrl}"></video>`,
    })

    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.status, 403)
      assert.match(result.error, /local video uploads are disabled/i)
    }
  })

  it('keeps formatting, links, images, YouTube, and Vimeo working while local video is disabled', async () => {
    const result = await preparePostInput({
      ...base,
      body: 'Image and embed',
      content_format: 'rich_text',
      content_json: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Image and embed' }] }],
      },
      content_html: '<p><strong>Image</strong> and <a href="https://example.com/guide">embed</a></p><img src="https://example.com/image.png"><iframe src="https://youtu.be/dQw4w9WgXcQ"></iframe><iframe src="https://vimeo.com/123456789"></iframe>',
    })

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.deepEqual(result.value.forumVideoPaths, [])
      assert.match(result.value.contentHtml || '', /<strong>/)
      assert.match(result.value.contentHtml || '', /href="https:\/\/example[.]com\/guide"/)
      assert.match(result.value.contentHtml || '', /<img/)
      assert.match(result.value.contentHtml || '', /youtube-nocookie[.]com/)
      assert.match(result.value.contentHtml || '', /player[.]vimeo[.]com/)
    }
  })

  it('rejects JSON/HTML video disagreement and temporary reservation URLs', async () => {
    const json = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Lesson video' }] },
        { type: 'localVideo', attrs: { src: approvedVideoUrl, mimeType: 'video/mp4' } },
      ],
    }

    assert.equal((await preparePostInput({
      ...base,
      content_format: 'rich_text',
      content_json: json,
      content_html: '<p>Lesson video</p>',
    })).ok, false)

    const reservedUrl = approvedVideoUrl.replace('/videos/', '/reservations/')
    assert.equal((await preparePostInput({
      ...base,
      content_format: 'rich_text',
      content_json: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Lesson video' }] },
          { type: 'localVideo', attrs: { src: reservedUrl, mimeType: 'video/mp4' } },
        ],
      },
      content_html: `<p>Lesson video</p><video src="${reservedUrl}"></video>`,
    })).ok, false)
  })

  it('survives non-ASCII text after a local video element (jsdom ESM regression)', async () => {
    const result = await preparePostInput(
      {
        ...base,
        body: 'Video with Japanese text',
        content_format: 'rich_text',
        content_json: {
          type: 'doc',
          content: [
            {
              type: 'localVideo',
              attrs: { src: approvedVideoUrl, mimeType: 'video/mp4' },
            },
            { type: 'paragraph', content: [{ type: 'text', text: '画期的な機能です' }] },
          ],
        },
        content_html:
          `<video src="${approvedVideoUrl}" controls="" preload="metadata" playsinline="" data-forum-video="" class="forum-local-video"></video><p>画期的な機能です</p>`,
      },
      { localVideoUploadEnabled: true },
    )

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.match(result.value.contentHtml || '', /data-forum-video/)
      assert.match(result.value.contentHtml || '', /forum-local-video/)
      assert.match(result.value.contentHtml || '', /画期的な機能です/)
      assert.equal(result.value.forumVideoPaths.length, 1)
    }
  })
})
