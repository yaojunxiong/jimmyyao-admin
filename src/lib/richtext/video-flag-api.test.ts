import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  validateVideoFlagBody,
  hasApiGuard,
  FLAG_KEY,
} from '@/lib/richtext/video-flag-operator'

describe('video-flag operator API', () => {
  describe('validateVideoFlagBody', () => {
    it('accepts { enabled: true }', () => {
      const result = validateVideoFlagBody({ enabled: true })
      assert.equal(result.ok, true)
      if (result.ok) assert.equal(result.enabled, true)
    })

    it('accepts { enabled: false }', () => {
      const result = validateVideoFlagBody({ enabled: false })
      assert.equal(result.ok, true)
      if (result.ok) assert.equal(result.enabled, false)
    })

    it('rejects null body', () => {
      const result = validateVideoFlagBody(null)
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.status, 400)
    })

    it('rejects undefined body', () => {
      const result = validateVideoFlagBody(undefined)
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.status, 400)
    })

    it('rejects array body', () => {
      const result = validateVideoFlagBody([{ enabled: true }])
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.status, 400)
    })

    it('rejects string body', () => {
      const result = validateVideoFlagBody('enabled')
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.status, 400)
    })

    it('rejects missing enabled field', () => {
      const result = validateVideoFlagBody({})
      assert.equal(result.ok, false)
      if (!result.ok) assert.match(result.error, /enabled/)
    })

    it('rejects string enabled', () => {
      const result = validateVideoFlagBody({ enabled: 'true' })
      assert.equal(result.ok, false)
      if (!result.ok) assert.match(result.error, /enabled/)
    })

    it('rejects number enabled', () => {
      const result = validateVideoFlagBody({ enabled: 1 })
      assert.equal(result.ok, false)
      if (!result.ok) assert.match(result.error, /enabled/)
    })

    it('rejects null enabled', () => {
      const result = validateVideoFlagBody({ enabled: null })
      assert.equal(result.ok, false)
      if (!result.ok) assert.match(result.error, /enabled/)
    })

    it('accepts extra fields alongside valid enabled (ignored silently)', () => {
      const result = validateVideoFlagBody({ enabled: true, key: 'other_flag' })
      assert.equal(result.ok, true)
      if (result.ok) assert.equal(result.enabled, true)
    })

    it('FLAG_KEY is forum_local_video_upload', () => {
      assert.equal(FLAG_KEY, 'forum_local_video_upload')
    })
  })

  describe('ENABLE_VIDEO_FLAG_OPERATOR_API guard', () => {
    it('returns false when env var is unset', () => {
      const prior = process.env.ENABLE_VIDEO_FLAG_OPERATOR_API
      delete process.env.ENABLE_VIDEO_FLAG_OPERATOR_API
      assert.equal(hasApiGuard(), false)
      if (prior !== undefined) process.env.ENABLE_VIDEO_FLAG_OPERATOR_API = prior
    })

    it('returns true when env var is exactly "true"', () => {
      const prior = process.env.ENABLE_VIDEO_FLAG_OPERATOR_API
      process.env.ENABLE_VIDEO_FLAG_OPERATOR_API = 'true'
      assert.equal(hasApiGuard(), true)
      if (prior !== undefined) process.env.ENABLE_VIDEO_FLAG_OPERATOR_API = prior
      else delete process.env.ENABLE_VIDEO_FLAG_OPERATOR_API
    })

    it('returns false when env var is "false" (string)', () => {
      const prior = process.env.ENABLE_VIDEO_FLAG_OPERATOR_API
      process.env.ENABLE_VIDEO_FLAG_OPERATOR_API = 'false'
      assert.equal(hasApiGuard(), false)
      if (prior !== undefined) process.env.ENABLE_VIDEO_FLAG_OPERATOR_API = prior
      else delete process.env.ENABLE_VIDEO_FLAG_OPERATOR_API
    })

    it('returns false when env var is empty string', () => {
      const prior = process.env.ENABLE_VIDEO_FLAG_OPERATOR_API
      process.env.ENABLE_VIDEO_FLAG_OPERATOR_API = ''
      assert.equal(hasApiGuard(), false)
      if (prior !== undefined) process.env.ENABLE_VIDEO_FLAG_OPERATOR_API = prior
      else delete process.env.ENABLE_VIDEO_FLAG_OPERATOR_API
    })
  })
})
