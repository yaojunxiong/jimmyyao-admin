'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const TipTapEditor = dynamic(() => import('@/components/richtext/tiptap-editor'), { ssr: false })

type Category = { value: string; label: string }

type Props = {
  categories: readonly Category[]
  adminEmail?: string
  richTextEnabled: boolean
  localVideoUploadEnabled: boolean
  localVideoApprovedOrigin: string | null
}

export default function ForumPostForm({
  categories,
  adminEmail,
  richTextEnabled,
  localVideoUploadEnabled,
  localVideoApprovedOrigin,
}: Props) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('grammar')
  const [useRichText, setUseRichText] = useState(richTextEnabled)
  const [bodyPlain, setBodyPlain] = useState('')
  const [richJson, setRichJson] = useState<unknown>(null)
  const [richHtml, setRichHtml] = useState('')
  const [richText, setRichText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [videoUploadPending, setVideoUploadPending] = useState(false)
  const [localVideoCount, setLocalVideoCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (videoUploadPending) {
      setError('Wait for the video upload and verification to finish before saving.')
      return
    }

    setSubmitting(true)
    setError(null)

    const body = useRichText ? richText : bodyPlain
    if (!body.trim()) {
      setError('Content is required.')
      setSubmitting(false)
      return
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      body: body,
      category,
      content_format: useRichText ? 'rich_text' : 'plain_text',
    }

    if (useRichText) {
      payload.content_json = richJson
      payload.content_html = richHtml
    }

    try {
      const res = await fetch('/api/admin/forum/posts', {
        method: 'POST',
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
        setError(data.error || 'Failed to create post')
        setSubmitting(false)
        return
      }

      router.push(`/forum/posts/${data.post_id}`)
      router.refresh()
    } catch (err) {
      setError(String(err))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {adminEmail ? (
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
          Posting as: <strong>{adminEmail}</strong>
        </p>
      ) : null}

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Title *</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title"
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

      {richTextEnabled && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={useRichText}
              disabled={videoUploadPending || localVideoCount > 0}
              title={
                localVideoCount > 0
                  ? 'Remove local videos before switching to plain text'
                  : undefined
              }
              onChange={(e) => setUseRichText(e.target.checked)}
              style={{
                width: 16,
                height: 16,
                cursor: videoUploadPending || localVideoCount > 0
                  ? 'not-allowed'
                  : 'pointer',
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
              Use Rich Text Editor (TipTap)
            </span>
          </label>

          <div style={{ display: useRichText ? 'block' : 'none' }} aria-hidden={!useRichText}>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                Supports headings, formatting, links, image uploads, and YouTube/Vimeo embeds.
                {' '}
                {localVideoUploadEnabled
                  ? 'Local MP4/WebM uploads are enabled (maximum 50 MB and 3 per post). Select a local video to remove it.'
                  : 'Local video upload is currently disabled; the other rich-text features remain available.'}
              </p>
              <TipTapEditor
                content=""
                onChange={(json, html, text) => {
                  setRichJson(json)
                  setRichHtml(html)
                  setRichText(text)
                }}
                placeholder="Write your forum post..."
                localVideoUploadEnabled={localVideoUploadEnabled}
                localVideoApprovedOrigin={localVideoApprovedOrigin}
                onVideoUploadStateChange={setVideoUploadPending}
                onLocalVideoCountChange={setLocalVideoCount}
              />
          </div>
        </div>
      )}

      {(!richTextEnabled || (richTextEnabled && !useRichText)) && (
        <div className="placeholder-card" style={{ marginBottom: 16 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Content *</span>
            <textarea
              value={bodyPlain}
              onChange={(e) => setBodyPlain(e.target.value)}
              placeholder="Write your forum post..."
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
              ? 'Creating...'
              : 'Create Post'}
        </button>
        <Link
          href="/forum"
          aria-disabled={videoUploadPending}
          onClick={(event) => {
            if (videoUploadPending) {
              event.preventDefault()
              return
            }

            if (
              localVideoCount > 0
              && !window.confirm(
                'Cancel this post? Its finalized local videos will remain until the reference-checked cleanup process removes them.',
              )
            ) {
              event.preventDefault()
            }
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
