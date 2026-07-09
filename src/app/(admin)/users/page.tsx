import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'

export const dynamic = 'force-dynamic'

type SearchParams = {
  q?: string
  role?: string
  active?: string
  sort?: string
}

type UserSummary = {
  user_key: string
  user_id: string | null
  email: string | null
  display_name: string | null
  avatar_url: string | null
  role: string
  vip_until: string | null
  created_at: string | null
  last_activity_at: string | null
  visitor_event_count: number
  forum_post_count: number
  forum_comment_count: number
  lesson_progress_count: number
  attempt_count: number
  is_admin: boolean
}

const ROLE_OPTIONS = ['all', 'admin', 'normal', 'unknown'] as const
const ACTIVE_OPTIONS = ['all', '24h', '7d', '30d', 'none'] as const
const SORT_OPTIONS = ['activity_desc', 'activity_asc', 'email_asc', 'email_desc', 'posts_desc', 'comments_desc'] as const

function activityStart(active: string) {
  const now = Date.now()
  if (active === '24h') return new Date(now - 24 * 60 * 60 * 1000).toISOString()
  if (active === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  if (active === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  return null
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const q = String(params.q || '').trim().toLowerCase().slice(0, 120)
  const role = ROLE_OPTIONS.includes(params.role as typeof ROLE_OPTIONS[number]) ? String(params.role) : 'all'
  const active = ACTIVE_OPTIONS.includes(params.active as typeof ACTIVE_OPTIONS[number]) ? String(params.active) : 'all'
  const sort = SORT_OPTIONS.includes(params.sort as typeof SORT_OPTIONS[number]) ? String(params.sort) : 'activity_desc'

  let users: UserSummary[] = []
  let errorMessage: string | null = null

  try {
    const { data, error } = await supabase.rpc('admin_get_user_summary')
    if (error) {
      errorMessage = error.message
    } else {
      users = (data || []) as UserSummary[]
    }
  } catch (e) {
    errorMessage = String(e)
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const activeThreshold = activityStart(active)

  let filtered = users.filter((user) => {
    if (role !== 'all' && user.role !== role) return false
    if (q) {
      const haystack = `${user.email || ''} ${user.display_name || ''} ${user.user_id || ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (active === 'none') return !user.last_activity_at
    if (activeThreshold) return !!user.last_activity_at && user.last_activity_at >= activeThreshold
    return true
  })

  filtered = filtered.sort((a, b) => {
    if (sort === 'activity_asc') return (a.last_activity_at || '').localeCompare(b.last_activity_at || '')
    if (sort === 'email_asc') return (a.email || '').localeCompare(b.email || '')
    if (sort === 'email_desc') return (b.email || '').localeCompare(a.email || '')
    if (sort === 'posts_desc') return b.forum_post_count - a.forum_post_count
    if (sort === 'comments_desc') return b.forum_comment_count - a.forum_comment_count
    return (b.last_activity_at || '').localeCompare(a.last_activity_at || '')
  })

  const adminCount = users.filter((u) => u.is_admin).length
  const todayActive = users.filter((u) => u.last_activity_at && new Date(u.last_activity_at) >= todayStart).length
  const sevenDayActive = users.filter((u) => u.last_activity_at && new Date(u.last_activity_at) >= sevenDaysAgo).length

  return (
    <>
      <div className="page-header">
        <h1>Users</h1>
        <p>Read-only unified user view from database-side admin summary RPC.</p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-card-label">Total Users</div><div className="stat-card-value">{users.length}</div></div>
        <div className="stat-card"><div className="stat-card-label">Admins</div><div className="stat-card-value">{adminCount}</div></div>
        <div className="stat-card"><div className="stat-card-label">Today Active</div><div className="stat-card-value">{todayActive}</div></div>
        <div className="stat-card"><div className="stat-card-label">7d Active</div><div className="stat-card-value">{sevenDayActive}</div></div>
      </div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <form method="get" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Search</span>
            <input name="q" defaultValue={q} placeholder="email / name / user id" style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Role</span>
            <select name="role" defaultValue={role} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              <option value="all">All</option>
              <option value="admin">Admin</option>
              <option value="normal">Normal</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Activity</span>
            <select name="active" defaultValue={active} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              <option value="all">All</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="none">No activity</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Sort</span>
            <select name="sort" defaultValue={sort} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              <option value="activity_desc">Last activity: newest</option>
              <option value="activity_asc">Last activity: oldest</option>
              <option value="email_asc">Email: A-Z</option>
              <option value="email_desc">Email: Z-A</option>
              <option value="posts_desc">Forum posts: most</option>
              <option value="comments_desc">Forum comments: most</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', paddingBottom: 2 }}>
            <button type="submit" style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Apply</button>
            <Link href="/users" style={{ background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>Clear</Link>
          </div>
        </form>
      </div>

      {errorMessage ? (
        <div className="placeholder-card" style={{ marginBottom: 16, borderColor: '#fecaca', background: '#fef2f2' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#991b1b' }}>Failed to load user summary: {errorMessage}</p>
        </div>
      ) : null}

      <div className="placeholder-card" style={{ overflowX: 'auto', padding: 0 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>No users found.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 960 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>User</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Role</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Last Activity</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Forum</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Visitor</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Study</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 300).map((user) => (
                  <tr key={user.user_key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '9px 12px', maxWidth: 260 }}>
                      <Link
                        href={`/users/${encodeURIComponent(user.user_key)}`}
                        style={{ fontWeight: 700, wordBreak: 'break-word', color: '#3b82f6', textDecoration: 'none' }}
                      >
                        {user.email || user.user_id || user.user_key}
                      </Link>
                      <div style={{ fontSize: 11, color: '#64748b', wordBreak: 'break-word' }}>{user.display_name || '-'}</div>
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ fontSize: 11, background: user.is_admin ? '#dbeafe' : '#f1f5f9', color: user.is_admin ? '#1d4ed8' : '#475569', borderRadius: 999, padding: '2px 8px', fontWeight: 700 }}>{user.role}</span>
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{formatTokyoDateTime(user.last_activity_at)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>{user.forum_post_count} / {user.forum_comment_count}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>{user.visitor_event_count}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>{user.lesson_progress_count} / {user.attempt_count}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{formatTokyoDateTime(user.created_at)}</td>
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
