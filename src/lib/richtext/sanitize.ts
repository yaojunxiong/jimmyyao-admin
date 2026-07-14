import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { normalizeVideoEmbedUrl, type SafeVideo } from './video-url'

export const MAX_RICH_HTML_LENGTH = 250_000

type SanitizeResult = {
  html: string
  text: string
}

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'strike',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'code',
  'ul', 'ol', 'li',
  'a', 'img', 'hr',
  'div', 'span', 'iframe',
  'figure', 'figcaption',
  'sup', 'sub',
]

const ALLOWED_ATTRIBUTES = [
  'href', 'target', 'rel', 'title',
  'src', 'alt', 'width', 'height', 'loading', 'decoding',
  'class',
  'data-youtube-video', 'data-vimeo-video',
  'allow', 'allowfullscreen', 'frameborder', 'referrerpolicy',
]

const ALLOWED_CLASSES = new Set(['video-embed', 'video-embed-frame'])

function isSafeLink(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:'
  } catch {
    return false
  }
}

function isSafeImage(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).protocol === 'https:'
  } catch {
    return false
  }
}

function setVideoAttributes(iframe: HTMLIFrameElement, video: SafeVideo) {
  for (const attribute of Array.from(iframe.attributes)) {
    iframe.removeAttribute(attribute.name)
  }

  iframe.setAttribute('src', video.src)
  iframe.setAttribute('title', video.provider === 'youtube' ? 'YouTube video' : 'Vimeo video')
  iframe.setAttribute('width', '640')
  iframe.setAttribute('height', '360')
  iframe.setAttribute('loading', 'lazy')
  iframe.setAttribute('allowfullscreen', '')
  iframe.setAttribute(
    'allow',
    video.provider === 'youtube'
      ? 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
      : 'autoplay; fullscreen; picture-in-picture',
  )
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
  iframe.setAttribute('class', 'video-embed-frame')
}

function ensureVideoWrapper(
  document: Document,
  iframe: HTMLIFrameElement,
  video: SafeVideo,
) {
  let wrapper = iframe.parentElement
  const isExistingWrapper = wrapper?.tagName === 'DIV'
    && (wrapper.hasAttribute('data-youtube-video') || wrapper.hasAttribute('data-vimeo-video'))

  if (!isExistingWrapper) {
    const newWrapper = document.createElement('div')
    iframe.replaceWith(newWrapper)
    newWrapper.appendChild(iframe)
    wrapper = newWrapper
  }

  wrapper!.removeAttribute('data-youtube-video')
  wrapper!.removeAttribute('data-vimeo-video')
  wrapper!.setAttribute(
    video.provider === 'youtube' ? 'data-youtube-video' : 'data-vimeo-video',
    '',
  )
  wrapper!.setAttribute('class', 'video-embed')
}

function restrictClasses(body: HTMLElement) {
  for (const element of Array.from(body.querySelectorAll('[class]'))) {
    const allowed = Array.from(element.classList).filter((name) => ALLOWED_CLASSES.has(name))
    if (allowed.length === 0) {
      element.removeAttribute('class')
    } else {
      element.setAttribute('class', allowed.join(' '))
    }
  }
}

function unwrapEmptyVideoWrappers(body: HTMLElement) {
  const wrappers = Array.from(
    body.querySelectorAll('div[data-youtube-video], div[data-vimeo-video]'),
  )
  for (const wrapper of wrappers) {
    if (!wrapper.querySelector(':scope > iframe')) {
      wrapper.replaceWith(...Array.from(wrapper.childNodes))
    }
  }
}

function extractText(body: HTMLElement): string {
  const clone = body.cloneNode(true) as HTMLElement
  const blockSelector = 'p,h1,h2,h3,h4,h5,h6,div,blockquote,li,pre,br,hr'
  for (const element of Array.from(clone.querySelectorAll(blockSelector))) {
    element.append(' ')
  }
  return (clone.textContent || '').replace(/\s+/g, ' ').trim()
}

export function sanitizeHtml(dirtyHtml: string): SanitizeResult {
  if (dirtyHtml.length > MAX_RICH_HTML_LENGTH) {
    throw new RangeError(`Rich-text HTML exceeds ${MAX_RICH_HTML_LENGTH} characters`)
  }

  const dom = new JSDOM('<!doctype html><html><body></body></html>')

  try {
    const purifier = createDOMPurify(dom.window)
    const clean = purifier.sanitize(dirtyHtml, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: [
        'script', 'style', 'svg', 'math', 'template', 'noscript',
        'object', 'embed', 'form', 'input', 'button', 'textarea',
        'select', 'option', 'meta', 'link', 'base',
      ],
    })

    const document = dom.window.document
    const body = document.body
    body.innerHTML = clean

    for (const link of Array.from(body.querySelectorAll('a'))) {
      const href = link.getAttribute('href') || ''
      if (!isSafeLink(href)) {
        link.removeAttribute('href')
        link.removeAttribute('target')
      } else {
        link.setAttribute('target', '_blank')
      }
      link.setAttribute('rel', 'noopener noreferrer nofollow')
    }

    for (const image of Array.from(body.querySelectorAll('img'))) {
      const src = image.getAttribute('src') || ''
      if (!isSafeImage(src)) {
        image.remove()
        continue
      }

      image.setAttribute('loading', 'lazy')
      image.setAttribute('decoding', 'async')
      for (const dimension of ['width', 'height'] as const) {
        const value = image.getAttribute(dimension)
        if (value && (!/^\d{1,4}$/.test(value) || Number(value) > 4096)) {
          image.removeAttribute(dimension)
        }
      }
    }

    for (const iframe of Array.from(body.querySelectorAll('iframe'))) {
      const video = normalizeVideoEmbedUrl(iframe.getAttribute('src') || '')
      if (!video) {
        iframe.remove()
        continue
      }

      setVideoAttributes(iframe, video)
      ensureVideoWrapper(document, iframe, video)
    }

    unwrapEmptyVideoWrappers(body)
    restrictClasses(body)

    return {
      html: body.innerHTML,
      text: extractText(body),
    }
  } finally {
    dom.window.close()
  }
}
