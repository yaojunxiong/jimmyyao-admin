import { sanitizeHtml } from '@/lib/richtext/sanitize'

type RichTextRendererProps = {
  html: string | null
  fallback: string | null
  format: string | null
}

export default async function RichTextRenderer({ html, fallback, format }: RichTextRendererProps) {
  if (format === 'rich_text' && html) {
    try {
      const sanitized = (await sanitizeHtml(html)).html
      if (sanitized.trim()) {
        return (
          <div
            className="rich-text-content"
            dangerouslySetInnerHTML={{ __html: sanitized }}
          />
        )
      }
    } catch {
      // Fall back to escaped text for malformed or oversized stored HTML.
    }
  }

  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {fallback || 'No content.'}
    </div>
  )
}
