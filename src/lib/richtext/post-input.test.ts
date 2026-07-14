import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_POST_BODY_LENGTH, preparePostInput } from './post-input'

const base = {
  title: 'Admin post',
  category: 'grammar',
}

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
})
