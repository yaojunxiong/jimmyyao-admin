import { MAX_RICH_HTML_LENGTH, sanitizeHtml } from './sanitize'

export const MAX_POST_BODY_LENGTH = 12_000
export const MAX_RICH_JSON_BYTES = 1_048_576

export const FORUM_CATEGORIES = [
  'grammar',
  'vocabulary',
  'wrong_question',
  'checkin',
  'announcement',
] as const

export type ForumContentFormat = 'plain_text' | 'rich_text'

type PostInput = {
  title?: unknown
  body?: unknown
  category?: unknown
  content_format?: unknown
  content_json?: unknown
  content_html?: unknown
}

export type PreparedPostInput = {
  title: string
  body: string
  category: typeof FORUM_CATEGORIES[number]
  contentFormat: ForumContentFormat
  contentJson: unknown | null
  contentHtml: string | null
  contentText: string | null
}

type PrepareResult =
  | { ok: true; value: PreparedPostInput }
  | { ok: false; error: string }

export function preparePostInput(input: PostInput): PrepareResult {
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (title.length < 2 || title.length > 120) {
    return { ok: false, error: 'Title must be between 2 and 120 characters' }
  }

  if (
    typeof input.category !== 'string'
    || !(FORUM_CATEGORIES as readonly string[]).includes(input.category)
  ) {
    return { ok: false, error: 'Invalid category' }
  }

  if (input.content_format !== 'plain_text' && input.content_format !== 'rich_text') {
    return { ok: false, error: 'Invalid content format' }
  }

  if (input.content_format === 'plain_text') {
    if (
      typeof input.body !== 'string'
      || input.body.trim().length < 1
      || input.body.length > MAX_POST_BODY_LENGTH
    ) {
      return {
        ok: false,
        error: `Body must be between 1 and ${MAX_POST_BODY_LENGTH} characters`,
      }
    }

    return {
      ok: true,
      value: {
        title,
        body: input.body,
        category: input.category as PreparedPostInput['category'],
        contentFormat: 'plain_text',
        contentJson: null,
        contentHtml: null,
        contentText: null,
      },
    }
  }

  if (
    !input.content_json
    || typeof input.content_json !== 'object'
    || Array.isArray(input.content_json)
  ) {
    return { ok: false, error: 'TipTap JSON is required for rich text' }
  }

  let jsonSize = 0
  try {
    jsonSize = new TextEncoder().encode(JSON.stringify(input.content_json)).byteLength
  } catch {
    return { ok: false, error: 'TipTap JSON is invalid' }
  }
  if (jsonSize > MAX_RICH_JSON_BYTES) {
    return { ok: false, error: 'TipTap JSON is too large' }
  }

  if (
    typeof input.content_html !== 'string'
    || input.content_html.length < 1
    || input.content_html.length > MAX_RICH_HTML_LENGTH
  ) {
    return { ok: false, error: 'Rich-text HTML is missing or too large' }
  }

  let sanitized: ReturnType<typeof sanitizeHtml>
  try {
    sanitized = sanitizeHtml(input.content_html)
  } catch {
    return { ok: false, error: 'Rich-text HTML is invalid or too large' }
  }

  if (sanitized.html.length > MAX_RICH_HTML_LENGTH) {
    return { ok: false, error: 'Sanitized rich-text HTML is too large' }
  }

  if (sanitized.text.length < 1 || sanitized.text.length > MAX_POST_BODY_LENGTH) {
    return {
      ok: false,
      error: `Rich-text content must contain between 1 and ${MAX_POST_BODY_LENGTH} text characters`,
    }
  }

  return {
    ok: true,
    value: {
      title,
      body: sanitized.text,
      category: input.category as PreparedPostInput['category'],
      contentFormat: 'rich_text',
      contentJson: input.content_json,
      contentHtml: sanitized.html,
      contentText: sanitized.text,
    },
  }
}
