import { mergeAttributes, Node } from '@tiptap/core'

export const Vimeo = Node.create({
  name: 'vimeo',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => (
          element.querySelector('iframe')?.getAttribute('src')
          || element.getAttribute('src')
        ),
      },
      width: {
        default: 640,
        parseHTML: (element) => Number(
          element.querySelector('iframe')?.getAttribute('width')
          || element.getAttribute('width')
          || 640,
        ),
      },
      height: {
        default: 360,
        parseHTML: (element) => Number(
          element.querySelector('iframe')?.getAttribute('height')
          || element.getAttribute('height')
          || 360,
        ),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-vimeo-video]' },
      { tag: 'iframe[src^="https://player.vimeo.com/video/"]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { src, width, height } = HTMLAttributes
    return [
      'div',
      mergeAttributes({ 'data-vimeo-video': '', class: 'video-embed' }),
      [
        'iframe',
        {
          src,
          width,
          height,
          title: 'Vimeo video',
          loading: 'lazy',
          allow: 'autoplay; fullscreen; picture-in-picture',
          allowfullscreen: '',
          class: 'video-embed-frame',
        },
      ],
    ]
  },
})
