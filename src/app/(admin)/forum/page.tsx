import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'

export const dynamic = 'force-dynamic'

type ForumPostRow = {
  id: string
  author_user_id: string | null
  author_email: string | null
  title: string | null
  category: string | null
  status: string | null
  comment_count: number | null
  is_pinned: boolean | null
  is_deleted: boolean | null
  review_note: string | null
  created_at: string | null
  updated_at: string | null
}

type ForumSearchParams = {
  q?: string
  category?: string
  status?: string
  range?: string
  sort?: string
}

const CATEGORIES = ['vocabulary', 'wrong_question', 'checkin', 'announcement', 'grammar'] as const
const STATUSES = ['pending', 'approved', 'rejected', 'hidden'] as const
const TIME_RANGES = ['1h', '24h', '7d', '30d', 'all'] as const
const SORT_OPTIONS = ['created_desc', 'created_asc', 'comment_desc', 'comment_asc', 'updated_desc', 'updated_asc'] as const
const FORUM_SELECT = 'id,author_user_id,author_email,title,category,status,comment_count,is_pinned,is_deleted,review_note,created_at,updated_at'

function categoryLabel(category: string | null | undefined) {
  if (category === 'vocabulary') return 'Vocabulary'
  if (category === 'wrong_question') return 'Wrong Question'
  if (category === 'checkin') return 'Check-in'
  if (category === 'announcement') return 'Announcement'
  return 'Grammar'
}

function statusLabel(status: string | null | undefined) {
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Rejected'
  if (status === 'hidden') return 'Hidden'
  return 'Pending'
}

function statusStyle(status: string | null | undefined) {
  if (status === 'approved') return { background: '#dcfce7', color: '#166534' }
  if (status === 'rejected') return { background: '#fee2e2', color: '#991b1b' }
  if (status === 'hidden') return { background: '#e2e8f0', color: '#334155' }
  return { background: '#fef3c7', color: '#92400e' }
}

function getRangeStart(range: string) {
  const now = Date.now()
  if (range === '1h') return new Date(now - 60 * 60 * 1000).toISOString()
  if (range === '24h') return new Date(now - 24 * 60 * 60 * 1000).toISOString()
  if (range === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  if (range === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  return null
}

function buildHref(params: ForumSearchParams, updates: Partial<ForumSearchParams>) {
  const next = { ...params, ...updates }
  const q = new URLSearchParams()
  if (next.q) q.set('q', next.q)
  if (next.category && next.category !== 'all') q.set('category', next.category)
  if (next.status && next.status !== 'all') q.set('status', next.status)
  if (next.range && next.range !== 'all') q.set('range', next.range)
  if (next.sort && next.sort !== 'created_desc') q.set('sort', next.sort)
  const query = q.toString()
  return `/forum${query ? `?${query}` : ''}`
}

function sortLabel(current: string, asc: string, desc: string, label: string) {
  if (current === asc) return `${label} ↑`
  if (current === desc) return `${label} ↓`
  return label
}

function toggleSort(current: string, asc: string, desc: string) {
  return current === desc ? asc : desc
}

export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<ForumSearchParams>
}) {
  const params = await searchParams
  const cookieStore = await cookies()

  const q = String(params.q || '').trim().slice(0, 120)
  const category: string = CATEGORIES.includes(params.category as typeof CATEGORIES[number]) ? String(params.category) : 'all'
  const status: string = STATUSES.includes(params.status as typeof STATUSES[number]) ? String(params.status) : 'all'
  const range: string = TIME_RANGES.includes(params.range as typeof TIME_RANGES[number]) ? String(params.range) : 'all'
  const sort: string = SORT_OPTIONS.includes(params.sort as typeof SORT_OPTIONS[number]) ? String(params.sort) : 'created_desc'

  const supabase = createClient(cookieStore)

  let totalPosts = 0
  let todayNewPosts = 0
  let totalComments = 0
  let commentTableExists = true

  try {
    const { count } = await supabase
      .from('forum_posts')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false)
    if (count !== null) totalPosts = count
  } catch {}

  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('forum_posts')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false)
      .gte('created_at', todayStart.toISOString())
    if (count !== null) todayNewPosts = count
  } catch {}

  try {
    const { count } = await supabase
      .from('forum_comments')
      .select('*', { count: 'exact', head: true })
    if (count !== null) totalComments = count
  } catch {
    commentTableExists = false
  }

  let posts: ForumPostRow[] = []
  let errorMessage: string | null = null

  try {
    let query = supabase
      .from('forum_posts')
      .select(FORUM_SELECT)
      .eq('is_deleted', false)

    if (category !== 'all') {
      query = query.eq('category', category)
    }

    if (status !== 'all') {
      query = query.eq('status', status)
    }

    const rangeStart = getRangeStart(range)
    if (rangeStart) {
      query = query.gte('created_at', rangeStart)
    }

    if (q) {
      const escapedQ = q.replace(/[%_\\]/g, '\\$&')
      query = query.or(`title.ilike.%${escapedQ}%,body.ilike.%${escapedQ}%,author_email.ilike.%${escapedQ}%`)
    }

    if (sort === 'created_asc') query = query.order('created_at', { ascending: true })
    else if (sort === 'comment_desc') query = query.order('comment_count', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
    else if (sort === 'comment_asc') query = query.order('comment_count', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
    else if (sort === 'updated_desc') query = query.order('updated_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
    else if (sort === 'updated_asc') query = query.order('updated_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
    else query = query.order('created_at', { ascending: false })

    const { data, error } = await query.limit(200)
    if (error) {
      errorMessage = error.message
    } else {
      posts = (data || []) as ForumPostRow[]
    }
  } catch (e) {
    errorMessage = String(e)
  }

  return (
    <>
      <div className="page-header">
        <h1>Forum Management</h1>
        <p>Read-only forum post management. Browse, search, and filter all forum posts.</p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-card-label">Total Posts</div>
          <div className="stat-card-value">{totalPosts}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Today New</div>
          <div className="stat-card-value">{todayNewPosts}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Comments</div>
          <div className="stat-card-value">{commentTableExists ? totalComments : 'N/A'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Filtered</div>
          <div className="stat-card-value">{posts.length}</div>
        </div>
      </div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <form method="get" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Search</span>
            <input name="q" defaultValue={q} placeholder="title / content / author" style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Category</span>
            <select name="category" defaultValue={category} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              <option value="all">All</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{categoryLabel(c)}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Status</span>
            <select name="status" defaultValue={status} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              <option value="all">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
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
              <option value="comment_desc">Replies: most</option>
              <option value="comment_asc">Replies: least</option>
              <option value="updated_desc">Updated: newest</option>
              <option value="updated_asc">Updated: oldest</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', paddingBottom: 2 }}>
            <button type="submit" style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Apply</button>
            <Link href="/forum" style={{ background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>Clear</Link>
          </div>
        </form>
      </div>

      <div className="placeholder-card" style={{ overflowX: 'auto', padding: 0 }}>
        {errorMessage ? (
          <p style={{ textAlign: 'center', padding: 24, color: '#dc2626', fontSize: 14 }}>Error: {errorMessage}</p>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>No forum posts found.</p>
            <p style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', marginTop: 8 }}>
              Category: {category} | Status: {status} | Range: {range} | Search: &quot;{q}&quot;
            </p>
            <p style={{ marginTop: 12 }}>
              <Link href="/forum" style={{ color: '#3b82f6', fontSize: 14 }}>Clear filters</Link>
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 860 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Title</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Author</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Category</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Status</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                    <Link href={buildHref(params, { sort: toggleSort(sort, 'comment_asc', 'comment_desc') })} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {sortLabel(sort, 'comment_asc', 'comment_desc', 'Replies')}
                    </Link>
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                    <Link href={buildHref(params, { sort: toggleSort(sort, 'created_asc', 'created_desc') })} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {sortLabel(sort, 'created_asc', 'created_desc', 'Created')}
                    </Link>
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                    <Link href={buildHref(params, { sort: toggleSort(sort, 'updated_asc', 'updated_desc') })} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {sortLabel(sort, 'updated_asc', 'updated_desc', 'Updated')}
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => {
                  const s = statusStyle(post.status)
                  return (
                    <tr key={post.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', maxWidth: 300 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, wordBreak: 'break-word' }}>{post.title || '-'}</span>
                        {post.is_pinned ? (
                          <span style={{ marginLeft: 6, fontSize: 10, background: '#e0e7ff', color: '#4338ca', borderRadius: 4, padding: '1px 6px', fontWeight: 700, whiteSpace: 'nowrap' }}>Pinned</span>
                        ) : null}
                        {post.review_note ? (
                          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>{post.review_note}</p>
                        ) : null}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {post.author_email || (post.author_user_id ? `${post.author_user_id.slice(0, 8)}...` : '-')}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', borderRadius: 999, padding: '2px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{categoryLabel(post.category)}</span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ ...s, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>{statusLabel(post.status)}</span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>{post.comment_count ?? 0}</td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{formatTokyoDateTime(post.created_at)}</td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{formatTokyoDateTime(post.updated_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
        Read-only view. Post management (approve, hide, delete, pin) not yet available.
      </p>
    </>
  )
}
