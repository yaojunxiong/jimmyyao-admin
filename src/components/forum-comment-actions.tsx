'use client'

import { useState } from 'react'

type Props = {
  commentId: string
  isDeleted: boolean
  compact?: boolean
}

export default function ForumCommentActions({ commentId, isDeleted, compact }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const action = isDeleted ? 'restore' : 'hide'
  const label = isDeleted ? 'Restore' : 'Hide'

  async function handleAction() {
    const confirmMsg = isDeleted
      ? 'Restore this comment? It will become visible again.'
      : 'Hide this comment? It will no longer be visible on the public forum.'

    if (!confirm(confirmMsg)) return

    setLoading(action)
    setError(null)

    try {
      const res = await fetch(`/api/admin/forum/comments/${commentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      const data = await res.json()

      if (!data.ok) {
        setError(data.error || 'Operation failed')
        setLoading(null)
        if (!compact) setTimeout(() => setError(null), 4000)
        return
      }

      window.location.reload()
    } catch (e) {
      setError(String(e))
      setLoading(null)
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        onClick={handleAction}
        disabled={loading !== null}
        style={{
          background: isDeleted ? '#ca8a04' : '#64748b',
          color: '#fff',
          border: 'none',
          borderRadius: compact ? 4 : 6,
          padding: compact ? '3px 10px' : '6px 14px',
          fontWeight: 600,
          fontSize: compact ? 11 : 12,
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {loading ? '...' : label}
      </button>
      {error && !compact ? (
        <span style={{ fontSize: 12, color: '#dc2626' }}>{error}</span>
      ) : null}
      {error && compact ? (
        <span style={{ fontSize: 10, color: '#dc2626', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={error}>
          {error}
        </span>
      ) : null}
    </span>
  )
}
