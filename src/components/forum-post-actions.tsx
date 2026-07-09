'use client'

import { useState } from 'react'

type Props = {
  postId: string
  currentStatus: string | null
  isDeleted: boolean | null
  currentReviewNote: string | null
}

export default function ForumPostActions({ postId, currentStatus, isDeleted, currentReviewNote }: Props) {
  const [reviewNote, setReviewNote] = useState(currentReviewNote || '')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const status = currentStatus || 'pending'
  const isHidden = status === 'hidden'
  const needsRestore = isDeleted || isHidden

  async function handleAction(action: string) {
    if (action === 'reject' && !confirm('Reject this post? The post will be marked as rejected.')) return
    if (action === 'hide' && !confirm('Hide this post? It will not be visible on the public forum.')) return
    if (action === 'restore' && !confirm('Restore this post? It will become visible again.')) return

    setLoading(action)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/admin/forum/posts/${postId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, review_note: reviewNote || null }),
      })

      const data = await res.json()

      if (!data.ok) {
        setError(data.error || 'Operation failed')
        setLoading(null)
        return
      }

      setSuccess(`${action.charAt(0).toUpperCase() + action.slice(1)} successful. Reloading...`)
      setTimeout(() => window.location.reload(), 800)
    } catch (e) {
      setError(String(e))
      setLoading(null)
    }
  }

  return (
    <div className="placeholder-card" style={{ marginBottom: 16 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>Admin Actions</h2>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Review Note (optional)</span>
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Add a review note..."
            rows={2}
            style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit', fontSize: 13, resize: 'vertical' }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: '#f1f5f9', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#475569' }}>
          Current: <span style={{ textTransform: 'uppercase' }}>{status}{isDeleted ? ', deleted' : ''}</span>
        </span>

        <button
          onClick={() => handleAction('approve')}
          disabled={loading !== null}
          style={{
            background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px',
            fontWeight: 600, fontSize: 13, cursor: loading === 'approve' ? 'wait' : 'pointer', opacity: loading === 'approve' ? 0.6 : 1,
          }}
        >
          {loading === 'approve' ? '...' : 'Approve'}
        </button>

        <button
          onClick={() => handleAction('reject')}
          disabled={loading !== null}
          style={{
            background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px',
            fontWeight: 600, fontSize: 13, cursor: loading === 'reject' ? 'wait' : 'pointer', opacity: loading === 'reject' ? 0.6 : 1,
          }}
        >
          {loading === 'reject' ? '...' : 'Reject'}
        </button>

        {!needsRestore ? (
          <button
            onClick={() => handleAction('hide')}
            disabled={loading !== null}
            style={{
              background: '#64748b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px',
              fontWeight: 600, fontSize: 13, cursor: loading === 'hide' ? 'wait' : 'pointer', opacity: loading === 'hide' ? 0.6 : 1,
            }}
          >
            {loading === 'hide' ? '...' : 'Hide'}
          </button>
        ) : (
          <button
            onClick={() => handleAction('restore')}
            disabled={loading !== null}
            style={{
              background: '#ca8a04', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px',
              fontWeight: 600, fontSize: 13, cursor: loading === 'restore' ? 'wait' : 'pointer', opacity: loading === 'restore' ? 0.6 : 1,
            }}
          >
            {loading === 'restore' ? '...' : 'Restore'}
          </button>
        )}
      </div>

      {error ? (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>
      ) : null}
      {success ? (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#16a34a' }}>{success}</p>
      ) : null}
    </div>
  )
}
