import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'
import ForumCommentActions from '@/components/forum-comment-actions'

export const dynamic = 'force-dynamic'

type ForumCommentRow = {
  id: string
  post_id: string
  author_user_id: string
  author_email: string | null
  body: string
  parent_comment_id: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
  forum_posts: { id: string; title: string | null } | null
}

type SearchParams = {
  q?: string
  deleted?: string
  range?: string
  sort?: string
}

const DELETED_OPTS = ['all', 'no', 'yes'] as const
const TIME_RANGES = ['1h', '24h', '7d', '30d', 'all'] as const
const SORT_OPTIONS = ['created_desc', 'created_asc'] as const

function rangeStart(range: string) {
  const now = Date.now()
  if (range === '1h') return new Date(now - 60 * 60 * 1000).toISOString()
  if (range === '24h') return new Date(now - 24 * 60 * 60 * 1000).toISOString()
  if (range === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  if (range === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  return null
}

function buildHref(params: SearchParams, updates: Partial<SearchParams>) {
  const next = { ...params, ...updates }
  const q = new URLSearchParams()
  if (next.q) q.set('q', next.q)
  if (next.deleted && next.deleted !== 'all') q.set('deleted', next.deleted)
  if (next.range && next.range !== 'all') q.set('range', next.range)
  if (next.sort && next.sort !== 'created_desc') q.set('sort', next.sort)
  const query = q.toString()
  return `/forum/comments${query ? `?${query}` : ''}`
}

function sortLabel(current: string, asc: string, desc: string, label: string) {
  if (current === asc) return `${label} ↑`
  if (current === desc) return `${label} ↓`
  return label
}

function toggleSort(current: string, asc: string, desc: string) {
  return current === desc ? asc : desc
}

export default async function ForumCommentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const cookieStore = await cookies()

  const q = String(params.q || '').trim().slice(0, 120)
  const deleted: string = DELETED_OPTS.includes(params.deleted as typeof DELETED_OPTS[number]) ? String(params.deleted) : 'all'
  const range: string = TIME_RANGES.includes(params.range as typeof TIME_RANGES[number]) ? String(params.range) : 'all'
  const sort: string = SORT_OPTIONS.includes(params.sort as typeof SORT_OPTIONS[number]) ? String(params.sort) : 'created_desc'

  const supabase = createClient(cookieStore)

  let totalComments = 0
  let todayNew = 0
  let deletedCount = 0

  try {
    const { count } = await supabase.from('forum_comments').select('*', { count: 'exact', head: true })
    if (count !== null) totalComments = count
  } catch {}

  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('forum_comments')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString())
    if (count !== null) todayNew = count
  } catch {}

  try {
    const { count } = await supabase
      .from('forum_comments')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', true)
    if (count !== null) deletedCount = count
  } catch {}

  let comments: ForumCommentRow[] = []
  let errorMessage: string | null = null

  try {
    let query = supabase
      .from('forum_comments')
      .select('id,post_id,author_user_id,author_email,body,parent_comment_id,is_deleted,created_at,updated_at,forum_posts(id,title)')

    if (deleted === 'no') {
      query = query.eq('is_deleted', false)
    } else if (deleted === 'yes') {
      query = query.eq('is_deleted', true)
    }

    const rangeVal = rangeStart(range)
    if (rangeVal) {
      query = query.gte('created_at', rangeVal)
    }

    if (q) {
      const escapedQ = q.replace(/[%_\\]/g, '\\$&')
      query = query.or(`body.ilike.%${escapedQ}%,author_email.ilike.%${escapedQ}%`)
    }

    if (sort === 'created_asc') {
      query = query.order('created_at', { ascending: true })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    const { data, error } = await query.limit(200)

    if (error) {
      errorMessage = error.message
    } else {
      comments = (data || []) as unknown as ForumCommentRow[]
    }
  } catch (e) {
    errorMessage = String(e)
  }

  type LatestAction = { action: string; actor_email: string | null; created_at: string | null }
  const lastActionMap = new Map<string, LatestAction>()
  let lastActionError = false

  if (comments.length > 0) {
    try {
      const commentIds = comments.map((c) => c.id)
      const { data: actions } = await supabase
        .from('latest_comment_admin_action')
        .select('comment_id,action,actor_email,created_at')
        .in('comment_id', commentIds)

      if (actions) {
        for (const a of actions as unknown as Array<{ comment_id: string; action: string; actor_email: string | null; created_at: string | null }>) {
          lastActionMap.set(a.comment_id, { action: a.action, actor_email: a.actor_email, created_at: a.created_at })
        }
      }
    } catch {
      lastActionError = true
    }
  }

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1>Forum Management</h1>
        <p>Read-only forum post and comment management.</p>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
        <Link
          href="/forum"
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            color: '#64748b',
            textDecoration: 'none',
          }}
        >
          Posts
        </Link>
        <Link
          href="/forum/comments"
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 700,
            color: '#3b82f6',
            textDecoration: 'none',
            borderBottom: '2px solid #3b82f6',
            marginBottom: -2,
          }}
        >
          Comments
        </Link>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-card-label">Total Comments</div>
          <div className="stat-card-value">{totalComments}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Today New</div>
          <div className="stat-card-value">{todayNew}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Deleted</div>
          <div className="stat-card-value">{deletedCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Filtered</div>
          <div className="stat-card-value">{comments.length}</div>
        </div>
      </div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <form method="get" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Search</span>
            <input name="q" defaultValue={q} placeholder="body / author email" style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Deleted</span>
            <select name="deleted" defaultValue={deleted} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              <option value="all">All</option>
              <option value="no">Not Deleted</option>
              <option value="yes">Deleted</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Time Range</span>
            <select name="range" defaultValue={range} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              <option value="all">All time</option>
              <option value="1h">Last hour</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Sort</span>
            <select name="sort" defaultValue={sort} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              <option value="created_desc">Created: newest</option>
              <option value="created_asc">Created: oldest</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', paddingBottom: 2 }}>
            <button type="submit" style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Apply</button>
            <Link href="/forum/comments" style={{ background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>Clear</Link>
          </div>
        </form>
      </div>

      <div className="placeholder-card" style={{ overflowX: 'auto', padding: 0 }}>
        {errorMessage ? (
          <p style={{ textAlign: 'center', padding: 24, color: '#dc2626', fontSize: 14 }}>Error: {errorMessage}</p>
        ) : comments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>No comments found.</p>
            <p style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', marginTop: 8 }}>
              Deleted: {deleted} | Range: {range} | Search: &quot;{q}&quot;
            </p>
            <p style={{ marginTop: 12 }}>
              <Link href="/forum/comments" style={{ color: '#3b82f6', fontSize: 14 }}>Clear filters</Link>
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Comment</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Post</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Author</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Body</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Deleted</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Actions</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Last Action</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                    <Link href={buildHref(params, { sort: toggleSort(sort, 'created_asc', 'created_desc') })} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {sortLabel(sort, 'created_asc', 'created_desc', 'Created')}
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comments.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.id.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '8px 12px', maxWidth: 200 }}>
                      <Link href={`/forum/posts/${c.post_id}`} style={{ fontWeight: 600, fontSize: 12, wordBreak: 'break-word', color: '#3b82f6', textDecoration: 'none' }}>
                        {c.forum_posts?.title || c.post_id.slice(0, 8) + '...'}
                      </Link>
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.author_email || c.author_user_id.slice(0, 8) + '...'}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569' }}>
                      {c.body}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      {c.is_deleted ? (
                        <span style={{ fontSize: 11, background: '#fee2e2', color: '#991b1b', borderRadius: 4, padding: '2px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>Deleted</span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <ForumCommentActions commentId={c.id} isDeleted={c.is_deleted} compact />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {lastActionError ? (
                        <span style={{ color: '#94a3b8' }}>N/A</span>
                      ) : (() => {
                        const la = lastActionMap.get(c.id)
                        if (!la) return <span style={{ color: '#94a3b8' }}>—</span>
                        return (
                          <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: 'capitalize',
                              background: la.action === 'hide' ? '#fee2e2' : '#dcfce7',
                              color: la.action === 'hide' ? '#991b1b' : '#166534',
                              borderRadius: 4,
                              padding: '1px 8px',
                              whiteSpace: 'nowrap',
                            }}>
                              {la.action}
                            </span>
                            {la.actor_email ? (
                              <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{la.actor_email.slice(0, 16)}</span>
                            ) : null}
                            <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#94a3b8' }}>{formatTokyoDateTime(la.created_at)}</span>
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{formatTokyoDateTime(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
