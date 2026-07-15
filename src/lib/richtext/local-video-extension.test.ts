import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { JSDOM } from 'jsdom'
import {
  createLocalVideoNode,
  LocalVideo,
} from '../../components/richtext/local-video-extension'
import { parseForumVideoPublicUrl } from './video-upload'

const publicUrl =
  'https://ycjuceortcduakxscfes.supabase.co/storage/v1/object/public/forum-videos/videos/7de72fea-5bb0-4b8a-a8ca-06ec2ffec947/2026/07/4a54a2f2-d662-4b5f-9fef-8bfbe8ebbd2b.mp4'
const approvedOrigin = 'https://ycjuceortcduakxscfes.supabase.co'

process.env.NEXT_PUBLIC_SUPABASE_URL = approvedOrigin
process.env.VERCEL_ENV = 'test'

const previousGlobals = new Map<string, PropertyDescriptor | undefined>()
let dom: JSDOM

function setGlobal(name: string, value: unknown) {
  previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  })
}

before(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://admin.jimmyyao.com',
  })
  setGlobal('window', dom.window)
  setGlobal('document', dom.window.document)
  setGlobal('navigator', dom.window.navigator)
  setGlobal('Node', dom.window.Node)
  setGlobal('HTMLElement', dom.window.HTMLElement)
  setGlobal('DOMParser', dom.window.DOMParser)
  setGlobal('getSelection', dom.window.getSelection.bind(dom.window))
})

after(() => {
  dom.window.close()
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

function createEditor(
  content: string | Record<string, unknown> = '<p>Before</p>',
  origin: string | null = approvedOrigin,
) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor({
    element,
    extensions: [StarterKit, LocalVideo.configure({ approvedOrigin: origin })],
    content,
  })
}

describe('TipTap localVideo node', () => {
  it('inserts a finalized video node with safe playback attributes only', () => {
    const reference = parseForumVideoPublicUrl(publicUrl)
    assert.ok(reference)
    const editor = createEditor()
    try {
      assert.equal(editor.commands.insertContent(createLocalVideoNode(reference)), true)
      const json = editor.getJSON()
      const localVideo = json.content?.find((node) => node.type === 'localVideo')
      assert.equal(localVideo?.attrs?.src, publicUrl)
      assert.equal(localVideo?.attrs?.mimeType, 'video/mp4')

      const html = editor.getHTML()
      assert.match(html, /<video/)
      assert.match(html, /data-forum-video=""/)
      assert.match(html, /controls=""/)
      assert.match(html, /preload="metadata"/)
      assert.match(html, /playsinline=""/)
      assert.doesNotMatch(html, /autoplay|onplay|onclick/i)
    } finally {
      editor.destroy()
    }
  })

  it('parses and preserves an existing finalized video while editing', () => {
    const editor = createEditor(
      `<p>Before</p><video src="${publicUrl}" data-forum-video="" controls preload="metadata" playsinline></video><p>After</p>`,
    )
    try {
      const localVideo = editor.getJSON().content?.find((node) => node.type === 'localVideo')
      assert.equal(localVideo?.attrs?.src, publicUrl)
      assert.equal(localVideo?.attrs?.mimeType, 'video/mp4')
      assert.match(editor.getHTML(), new RegExp(publicUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    } finally {
      editor.destroy()
    }
  })

  it('removes the selected video node without removing surrounding text', () => {
    const editor = createEditor(
      `<p>Before</p><video src="${publicUrl}" data-forum-video=""></video><p>After</p>`,
    )
    try {
      let videoPosition = -1
      editor.state.doc.descendants((node, position) => {
        if (node.type.name === 'localVideo') videoPosition = position
      })
      assert.ok(videoPosition >= 0)
      assert.equal(editor.commands.setNodeSelection(videoPosition), true)
      assert.equal(editor.isActive('localVideo'), true)
      assert.equal(editor.commands.deleteSelection(), true)
      assert.equal(
        editor.getJSON().content?.some((node) => node.type === 'localVideo'),
        false,
      )
      assert.match(editor.getText(), /Before/)
      assert.match(editor.getText(), /After/)
    } finally {
      editor.destroy()
    }
  })

  it('does not parse a video node from an unapproved origin', () => {
    const editor = createEditor(
      `<p>Safe text</p><video src="${publicUrl.replace('ycjuceortcduakxscfes.supabase.co', 'evil.example')}" data-forum-video=""></video>`,
    )
    try {
      assert.equal(
        editor.getJSON().content?.some((node) => node.type === 'localVideo'),
        false,
      )
      assert.match(editor.getText(), /Safe text/)
    } finally {
      editor.destroy()
    }
  })

  it('does not parse local videos when the server-resolved origin is unavailable', () => {
    const editor = createEditor(
      `<p>Safe text</p><video src="${publicUrl}" data-forum-video=""></video>`,
      null,
    )
    try {
      assert.equal(
        editor.getJSON().content?.some((node) => node.type === 'localVideo'),
        false,
      )
      assert.match(editor.getText(), /Safe text/)
    } finally {
      editor.destroy()
    }
  })
})
