import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'

async function readSource(relativePath: string) {
  return readFile(path.join(process.cwd(), relativePath), 'utf8')
}

describe('local-video feature enforcement seams', () => {
  it('gates both video APIs before parsing input or touching reservations and Storage', async () => {
    for (const relativePath of [
      'src/app/api/admin/forum/upload/video/route.ts',
      'src/app/api/admin/forum/upload/video/finalize/route.ts',
    ]) {
      const source = await readSource(relativePath)
      const gate = source.indexOf('await isLocalVideoUploadFeatureEnabled')
      const parse = source.indexOf('request.json()')
      const trackingTable = source.indexOf(".from('forum_video_uploads')")
      const storage = source.indexOf('.storage')

      assert.ok(gate >= 0, `${relativePath} must use the local-video flag`)
      assert.ok(parse > gate, `${relativePath} must gate before parsing the body`)
      assert.ok(
        trackingTable === -1 || trackingTable > gate,
        `${relativePath} must gate before reading video reservations`,
      )
      assert.ok(
        storage === -1 || storage > gate,
        `${relativePath} must gate before using Storage`,
      )
      assert.match(source, /Local video uploads are disabled[\s\S]*403/)
      assert.doesNotMatch(source, /isRichTextFeatureEnabled/)
    }
  })

  it('gates new local-video references in both post-write APIs', async () => {
    for (const relativePath of [
      'src/app/api/admin/forum/posts/route.ts',
      'src/app/api/admin/forum/posts/[id]/edit/route.ts',
    ]) {
      const source = await readSource(relativePath)
      assert.match(source, /isLocalVideoUploadFeatureEnabled/)
      assert.match(source, /preparePostInput\([\s\S]*localVideoUploadEnabled/)
      assert.match(source, /validateFinalizedVideoPaths/)
    }
  })

  it('disables the editor upload control without removing other rich-media tools', async () => {
    const source = await readSource('src/components/richtext/tiptap-editor.tsx')

    assert.match(source, /disabled=\{[\s\S]*!localVideoUploadEnabled/)
    assert.match(source, /Video Upload Disabled/)
    assert.match(source, /if \(!localVideoUploadEnabled\)/)
    assert.match(source, /addYoutubeVideo/)
    assert.match(source, /addVimeoVideo/)
    assert.match(source, /handleImageUpload/)
  })
})
