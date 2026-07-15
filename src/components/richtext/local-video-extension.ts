import { Node, type JSONContent } from '@tiptap/core'
import {
  parseForumVideoPublicUrlForOrigin,
  type ForumVideoReference,
} from '@/lib/richtext/video-upload'

type LocalVideoOptions = {
  approvedOrigin: string | null
}

export function createLocalVideoNode(video: ForumVideoReference): JSONContent {
  return {
    type: 'localVideo',
    attrs: {
      src: video.publicUrl,
      mimeType: video.mime,
    },
  }
}

export const LocalVideo = Node.create<LocalVideoOptions>({
  name: 'localVideo',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { approvedOrigin: null }
  },

  addAttributes() {
    const approvedOrigin = this.options.approvedOrigin
    return {
      src: {
        default: null,
        parseHTML: (element) => parseForumVideoPublicUrlForOrigin(
          element.getAttribute('src') || '',
          approvedOrigin,
        )?.publicUrl || null,
      },
      mimeType: {
        default: null,
        parseHTML: (element) => parseForumVideoPublicUrlForOrigin(
          element.getAttribute('src') || '',
          approvedOrigin,
        )?.mime || null,
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    const approvedOrigin = this.options.approvedOrigin
    return [{
      tag: 'video[data-forum-video]',
      getAttrs: (element) => {
        if (typeof element === 'string') return false
        return parseForumVideoPublicUrlForOrigin(
          element.getAttribute('src') || '',
          approvedOrigin,
        ) ? {} : false
      },
    }]
  },

  renderHTML({ node }) {
    const approvedOrigin = this.options.approvedOrigin
    const video = typeof node.attrs.src === 'string'
      ? parseForumVideoPublicUrlForOrigin(node.attrs.src, approvedOrigin)
      : null

    return [
      'video',
      {
        src: video?.publicUrl || '',
        controls: '',
        preload: 'metadata',
        playsinline: '',
        'data-forum-video': '',
        class: 'forum-local-video',
      },
    ]
  },
})
