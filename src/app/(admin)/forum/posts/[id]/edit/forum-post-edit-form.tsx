'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const TipTapEditor = dynamic(() => import('@/components/richtext/tiptap-editor'), { ssr: false })

function plainTextToHtml(value: string): string {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  return `<p>${escaped.replace(/\n/g, '<br>')}</p>`
}

type Category = { value: string; label: string }

type Props = {
  postId: string
  initialTitle: string
  initialCategory: string
  initialFormat: string
  initialBody: string
  initialRichHtml: string | null
  initialRichJson: unknown
  categories: readonly Category[]
  localVideoUploadEnabled: boolean
  localVideoApprovedOrigin: string | null
}

export default function ForumPostEditForm({
  postId,
  initialTitle,
  initialCategory,
  initialFormat,
  initialBody,
  initialRichHtml,
  initialRichJson: _initialRichJson,
  categories,
  localVideoUploadEnabled,
  localVideoApprovedOrigin,
}: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [category, setCategory] = useState(initialCategory)
  const isRichText = initialFormat === 'rich_text'
  const [bodyPlain, setBodyPlain] = useState(initialBody)
  const [richJson, setRichJson] = useState<unknown>(initialFormat === 'rich_text' ? _initialRichJson : null)
  const [richHtml, setRichHtml] = useState(initialRichHtml || '')
  const [richText, setRichText] = useState(initialBody)
  const [submitting, setSubmitting] = useState(false)
  const [videoUploadPending, setVideoUploadPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initialEditorContent = initialRichHtml || plainTextToHtml(initialBody)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (videoUploadPending) {
      setError('Wait for the video upload and verification to finish before saving.')
      return
    }

    setSubmitting(true)
    setError(null)

    const body = isRichText ? richText : bodyPlain
    if (!body.trim()) {
      setError('Content is required.')
      setSubmitting(false)
      return
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      body: body,
      category,
      content_format: isRichText ? 'rich_text' : 'plain_text',
    }

    if (isRichText) {
      payload.content_json = richJson
      payload.content_html = richHtml
    }

    try {
      const res = await fetch(`/api/admin/forum/posts/${postId}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        setError('Server returned an unexpected response. Please try again or contact support.')
        setSubmitting(false)
        return
      }

      const data = await res.json()

      if (!data.ok) {
        setError(data.error || 'Failed to update post')
        setSubmitting(false)
        return
      }

      router.push(`/forum/posts/${postId}`)
      router.refresh()
    } catch (err) {
      setError(String(err))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Title *</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={2}
              maxLength={120}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '10px 12px',
                font: 'inherit',
                fontSize: 15,
                fontWeight: 600,
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Category *</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '10px 12px',
                font: 'inherit',
                fontSize: 14,
              }}
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {isRichText ? (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            Supports headings, formatting, links, image uploads, and YouTube/Vimeo embeds.
            {' '}
            {localVideoUploadEnabled
              ? 'Local MP4/WebM uploads are enabled (maximum 50 MB and 3 per post). Select a local video to remove it.'
              : 'New local videos are disabled. Existing local-video nodes remain visible and removable.'}
          </p>
          <TipTapEditor
            content={initialEditorContent}
            onChange={(json, html, text) => {
              setRichJson(json)
              setRichHtml(html)
              setRichText(text)
            }}
            placeholder="Write your forum post..."
            localVideoUploadEnabled={localVideoUploadEnabled}
            localVideoApprovedOrigin={localVideoApprovedOrigin}
            onVideoUploadStateChange={setVideoUploadPending}
          />
        </div>
      ) : (
        <div className="placeholder-card" style={{ marginBottom: 16 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Content *</span>
            <textarea
              value={bodyPlain}
              onChange={(e) => setBodyPlain(e.target.value)}
              required
              rows={12}
              maxLength={12000}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '10px 12px',
                font: 'inherit',
                fontSize: 14,
                lineHeight: 1.7,
                resize: 'vertical',
              }}
            />
          </label>
          <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 12 }}>
            This legacy post remains in the existing plain-text format.
          </p>
        </div>
      )}

      {error ? (
        <p role="alert" style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{error}</p>
      ) : null}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          disabled={submitting || videoUploadPending}
          style={{
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 24px',
            fontWeight: 600,
            fontSize: 14,
            cursor: submitting
              ? 'wait'
              : videoUploadPending
                ? 'not-allowed'
                : 'pointer',
            opacity: submitting || videoUploadPending ? 0.6 : 1,
          }}
        >
          {videoUploadPending
            ? 'Finishing Video Upload…'
            : submitting
              ? 'Saving...'
              : 'Save Changes'}
        </button>
        <Link
          href={`/forum/posts/${postId}`}
          aria-disabled={videoUploadPending}
          onClick={(event) => {
            if (videoUploadPending) event.preventDefault()
          }}
          style={{
            background: 'transparent',
            color: '#64748b',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '10px 24px',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
            display: 'inline-block',
            pointerEvents: videoUploadPending ? 'none' : 'auto',
            opacity: videoUploadPending ? 0.6 : 1,
          }}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
