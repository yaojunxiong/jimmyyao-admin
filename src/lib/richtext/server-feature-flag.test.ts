import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isLocalVideoUploadFeatureEnabled,
  isRichTextFeatureEnabled,
} from './server-feature-flag'

function createFeatureFlagClient(
  flags: Record<string, unknown>,
  failingKeys: readonly string[] = [],
) {
  const queriedKeys: string[] = []
  const client = {
    from(table: string) {
      assert.equal(table, 'feature_flags')
      let key = ''
      return {
        select(columns: string) {
          assert.equal(columns, 'value')
          return this
        },
        eq(column: string, value: string) {
          assert.equal(column, 'key')
          key = value
          queriedKeys.push(value)
          return this
        },
        async maybeSingle() {
          if (failingKeys.includes(key)) {
            return { data: null, error: new Error('query failed') }
          }
          if (!(key in flags)) return { data: null, error: null }
          return { data: { value: flags[key] }, error: null }
        },
      }
    },
  } as unknown as SupabaseClient

  return { client, queriedKeys }
}

describe('server feature-flag isolation', () => {
  it('does not let forum_rich_text enable local-video upload', async () => {
    const { client, queriedKeys } = createFeatureFlagClient({
      forum_rich_text: { enabled_for: ['admin'] },
      forum_local_video_upload: { enabled_for: [] },
    })

    assert.equal(await isRichTextFeatureEnabled(client, 'admin'), true)
    assert.equal(await isLocalVideoUploadFeatureEnabled(client, 'admin'), false)
    assert.deepEqual(queriedKeys, [
      'forum_rich_text',
      'forum_local_video_upload',
    ])
  })

  it('allows only an administrator explicitly enabled by the video flag', async () => {
    const { client, queriedKeys } = createFeatureFlagClient({
      forum_local_video_upload: { enabled_for: ['admin', 'member'] },
    })

    assert.equal(await isLocalVideoUploadFeatureEnabled(client, 'admin'), true)
    assert.equal(await isLocalVideoUploadFeatureEnabled(client, 'member'), false)
    assert.equal(await isLocalVideoUploadFeatureEnabled(client, 'anon'), false)
    assert.deepEqual(queriedKeys, ['forum_local_video_upload'])
  })

  it('fails closed when the video flag is absent or its query fails', async () => {
    const missing = createFeatureFlagClient({})
    const failing = createFeatureFlagClient({}, ['forum_local_video_upload'])

    assert.equal(
      await isLocalVideoUploadFeatureEnabled(missing.client, 'admin'),
      false,
    )
    assert.equal(
      await isLocalVideoUploadFeatureEnabled(failing.client, 'admin'),
      false,
    )
  })
})
