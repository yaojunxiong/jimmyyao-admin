import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_FLAG,
  FEATURE_FLAG_KEY,
  LOCAL_VIDEO_FEATURE_FLAG_KEY,
  isLocalVideoUploadEnabledFor,
  isRichTextEnabledFor,
  parseFeatureFlag,
} from './feature-flag'

describe('parseFeatureFlag', () => {
  it('fails closed when flag data is unavailable or malformed', () => {
    assert.deepEqual(DEFAULT_FLAG, { enabled_for: [] })
    assert.equal(isRichTextEnabledFor(parseFeatureFlag(null), 'admin'), false)
    assert.equal(isRichTextEnabledFor(parseFeatureFlag({ enabled_for: 'admin' }), 'admin'), false)
  })

  it('returns default for null input', () => {
    const result = parseFeatureFlag(null)
    assert.deepEqual(result, DEFAULT_FLAG)
  })

  it('returns default for undefined input', () => {
    const result = parseFeatureFlag(undefined)
    assert.deepEqual(result, DEFAULT_FLAG)
  })

  it('returns default for empty object', () => {
    const result = parseFeatureFlag({})
    assert.deepEqual(result, DEFAULT_FLAG)
  })

  it('parses valid admin-only flag', () => {
    const result = parseFeatureFlag({ enabled_for: ['admin'] })
    assert.deepEqual(result, { enabled_for: ['admin'] })
  })

  it('parses admin+member flag', () => {
    const result = parseFeatureFlag({ enabled_for: ['admin', 'member'] })
    assert.deepEqual(result, { enabled_for: ['admin', 'member'] })
  })

  it('filters out invalid roles', () => {
    const result = parseFeatureFlag({ enabled_for: ['admin', 'superuser', 'member', 'guest'] })
    assert.deepEqual(result, { enabled_for: ['admin', 'member'] })
  })

  it('returns default when enabled_for is not an array', () => {
    const result = parseFeatureFlag({ enabled_for: 'admin' })
    assert.deepEqual(result, DEFAULT_FLAG)
  })
})

describe('isRichTextEnabledFor', () => {
  it('returns true for admin when admin is in enabled_for', () => {
    assert.equal(isRichTextEnabledFor({ enabled_for: ['admin'] }, 'admin'), true)
  })

  it('returns false for member when only admin is in enabled_for', () => {
    assert.equal(isRichTextEnabledFor({ enabled_for: ['admin'] }, 'member'), false)
  })

  it('returns true for member when member is in enabled_for', () => {
    assert.equal(isRichTextEnabledFor({ enabled_for: ['admin', 'member'] }, 'member'), true)
  })

  it('returns false for admin when no roles match', () => {
    assert.equal(isRichTextEnabledFor({ enabled_for: [] }, 'admin'), false)
  })

  it('returns false for unknown roles', () => {
    assert.equal(isRichTextEnabledFor({ enabled_for: ['admin'] }, 'vip'), false)
  })
})

describe('independent local-video feature flag', () => {
  it('uses a separate key from the rich-text feature', () => {
    assert.equal(FEATURE_FLAG_KEY, 'forum_rich_text')
    assert.equal(LOCAL_VIDEO_FEATURE_FLAG_KEY, 'forum_local_video_upload')
    assert.notEqual(LOCAL_VIDEO_FEATURE_FLAG_KEY, FEATURE_FLAG_KEY)
  })

  it('does not enable local video merely because rich text is enabled', () => {
    const richTextFlag = parseFeatureFlag({ enabled_for: ['admin'] })
    const videoFlag = parseFeatureFlag({ enabled_for: [] })

    assert.equal(isRichTextEnabledFor(richTextFlag, 'admin'), true)
    assert.equal(isLocalVideoUploadEnabledFor(videoFlag, 'admin'), false)
  })

  it('permits only administrators when the video flag enables admin', () => {
    const flag = parseFeatureFlag({ enabled_for: ['admin', 'member'] })

    assert.equal(isLocalVideoUploadEnabledFor(flag, 'admin'), true)
    assert.equal(isLocalVideoUploadEnabledFor(flag, 'member'), false)
    assert.equal(isLocalVideoUploadEnabledFor(flag, 'anon'), false)
    assert.equal(isLocalVideoUploadEnabledFor(flag, ''), false)
  })

  it('fails closed for missing or malformed video flag data', () => {
    assert.equal(isLocalVideoUploadEnabledFor(parseFeatureFlag(null), 'admin'), false)
    assert.equal(isLocalVideoUploadEnabledFor(
      parseFeatureFlag({ enabled_for: 'admin' }),
      'admin',
    ), false)
  })
})
