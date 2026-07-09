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

type ProfileRow = {
  id: string
  email: string | null
  display_name: string | null
  created_at: string | null
  updated_at: string | null
}

type RoleRow = {
  user_id: string
  email: string | null
  role: string
  created_at: string | null
  updated_at: string | null
}

type VisitorRow = {
  user_id: string | null
  email: string | null
  user_email: string | null
  created_at: string
}

type ForumAuthorRow = {
  author_user_id: string | null
  author_email: string | null
  created_at: string
}

type LessonProgressRow = {
  user_id: string | null
  user_email: string | null
  user_key: string | null
  created_at: string
  updated_at: string
}

type AttemptRow = {
  user_id: string
  created_at: string
}

type UserSummary = {
  key: string
  userId: string | null
  email: string | null
  name: string | null
  role: string
  createdAt: string | null
  lastActivityAt: string | null
  forumPostCount: number
  forumCommentCount: number
  visitorEventCount: number
  lessonProgressCount: number
  attemptCount: number
}

const ROLE_OPTIONS = ['all', 'admin', 'normal', 'unknown'] as const
const ACTIVE_OPTIONS = ['all', '24h', '7d', '30d', 'none'] as const
const SORT_OPTIONS = ['activity_desc', 'activity_asc', 'email_asc', 'email_desc', 'posts_desc', 'comments_desc'] as const

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() || null
}

function maxDate(a: string | null, b: string | null | undefined) {
  if (!b) return a
  if (!a) return b
  return new Date(b).getTime() > new Date(a).getTime() ? b : a
}

function minDate(a: string | null, b: string | null | undefined) {
  if (!b) return a
  if (!a) return b
  return new Date(b).getTime() < new Date(a).getTime() ? b : a
}

function activityStart(active: string) {
  const now = Date.now()
  if (active === '24h') return new Date(now - 24 * 60 * 60 * 1000).toISOString()
  if (active === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  if (active === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  return null
}

function identity(userId?: string | null, email?: string | null, fallback?: string | null) {
  if (userId) return `id:${userId}`
  const cleanEmail = normalizeEmail(email)
  if (cleanEmail) return `email:${cleanEmail}`
  return `key:${fallback || 'unknown'}`
}

function getOrCreate(users: Map<string, UserSummary>, userId?: string | null, email?: string | null, fallback?: string | null) {
  const key = identity(userId, email, fallback)
  const existing = users.get(key)
  if (existing) return existing

  const user: UserSummary = {
    key,
    userId: userId || null,
    email: normalizeEmail(email),
    name: null,
    role: 'unknown',
    createdAt: null,
    lastActivityAt: null,
    forumPostCount: 0,
    forumCommentCount: 0,
    visitorEventCount: 0,
    lessonProgressCount: 0,
    attemptCount: 0,
  }
  users.set(key, user)
  return user
}

function mergeProfile(users: Map<string, UserSummary>, row: ProfileRow) {
  const user = getOrCreate(users, row.id, row.email)
  user.email = user.email || normalizeEmail(row.email)
  user.name = user.name || row.display_name
  user.createdAt = minDate(user.createdAt, row.created_at)
  user.lastActivityAt = maxDate(user.lastActivityAt, row.updated_at)
}

function mergeRole(users: Map<string, UserSummary>, row: RoleRow) {
  const user = getOrCreate(users, row.user_id, row.email)
  user.email = user.email || normalizeEmail(row.email)
  user.role = row.role || user.role
  user.createdAt = minDate(user.createdAt, row.created_at)
  user.lastActivityAt = maxDate(user.lastActivityAt, row.updated_at)
}

function mergeActivity(user: UserSummary, at: string | null | undefined) {
  user.createdAt = minDate(user.createdAt, at)
  user.lastActivityAt = maxDate(user.lastActivityAt, at)
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

  const users = new Map<string, UserSummary>()
  const errors: string[] = []

  try {
    const { data, error } = await supabase.from('profiles').select('id,email,display_name,created_at,updated_at').limit(2000)
    if (error) errors.push(`profiles: ${error.message}`)
    else (data || []).forEach((row) => mergeProfile(users, row as ProfileRow))
  } catch (e) {
    errors.push(`profiles: ${String(e)}`)
  }

  try {
    const { data, error } = await supabase.from('user_roles').select('user_id,email,role,created_at,updated_at').limit(2000)
    if (error) errors.push(`user_roles: ${error.message}`)
    else (data || []).forEach((row) => mergeRole(users, row as RoleRow))
  } catch (e) {
    errors.push(`user_roles: ${String(e)}`)
  }

  try {
    const { data, error } = await supabase.from('visitor_activity_events').select('user_id,email,user_email,created_at').order('created_at', { ascending: false }).limit(5000)
    if (error) errors.push(`visitor_activity_events: ${error.message}`)
    else (data || []).forEach((row) => {
      const r = row as VisitorRow
      const user = getOrCreate(users, r.user_id, r.email || r.user_email)
      user.visitorEventCount += 1
      mergeActivity(user, r.created_at)
    })
  } catch (e) {
    errors.push(`visitor_activity_events: ${String(e)}`)
  }

  try {
    const { data, error } = await supabase.from('forum_posts').select('author_user_id,author_email,created_at').limit(5000)
    if (error) errors.push(`forum_posts: ${error.message}`)
    else (data || []).forEach((row) => {
      const r = row as ForumAuthorRow
      const user = getOrCreate(users, r.author_user_id, r.author_email)
      user.forumPostCount += 1
      mergeActivity(user, r.created_at)
    })
  } catch (e) {
    errors.push(`forum_posts: ${String(e)}`)
  }

  try {
    const { data, error } = await supabase.from('forum_comments').select('author_user_id,author_email,created_at').limit(5000)
    if (error) errors.push(`forum_comments: ${error.message}`)
    else (data || []).forEach((row) => {
      const r = row as ForumAuthorRow
      const user = getOrCreate(users, r.author_user_id, r.author_email)
      user.forumCommentCount += 1
      mergeActivity(user, r.created_at)
    })
  } catch (e) {
    errors.push(`forum_comments: ${String(e)}`)
  }

  try {
    const { data, error } = await supabase.from('lesson_progress').select('user_id,user_email,user_key,created_at,updated_at').limit(5000)
    if (error) errors.push(`lesson_progress: ${error.message}`)
    else (data || []).forEach((row) => {
      const r = row as LessonProgressRow
      const user = getOrCreate(users, r.user_id, r.user_email, r.user_key)
      user.lessonProgressCount += 1
      mergeActivity(user, maxDate(r.created_at, r.updated_at))
    })
  } catch (e) {
    errors.push(`lesson_progress: ${String(e)}`)
  }

  try {
    const { data, error } = await supabase.from('user_attempts').select('user_id,created_at').limit(5000)
    if (error) errors.push(`user_attempts: ${error.message}`)
    else (data || []).forEach((row) => {
      const r = row as AttemptRow
      const user = getOrCreate(users, r.user_id, null)
      user.attemptCount += 1
      mergeActivity(user, r.created_at)
    })
  } catch (e) {
    errors.push(`user_attempts: ${String(e)}`)
  }

  const allUsers = Array.from(users.values())
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const activeThreshold = activityStart(active)

  let filtered = allUsers.filter((user) => {
    if (role !== 'all' && user.role !== role) return false
    if (q) {
      const haystack = `${user.email || ''} ${user.name || ''} ${user.userId || ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (active === 'none') return !user.lastActivityAt
    if (activeThreshold) return !!user.lastActivityAt && user.lastActivityAt >= activeThreshold
    return true
  })

  filtered = filtered.sort((a, b) => {
    if (sort === 'activity_asc') return (a.lastActivityAt || '').localeCompare(b.lastActivityAt || '')
    if (sort === 'email_asc') return (a.email || '').localeCompare(b.email || '')
    if (sort === 'email_desc') return (b.email || '').localeCompare(a.email || '')
    if (sort === 'posts_desc') return b.forumPostCount - a.forumPostCount
    if (sort === 'comments_desc') return b.forumCommentCount - a.forumCommentCount
    return (b.lastActivityAt || '').localeCompare(a.lastActivityAt || '')
  })

  const adminCount = allUsers.filter((u) => u.role === 'admin').length
  const todayActive = allUsers.filter((u) => u.lastActivityAt && new Date(u.lastActivityAt) >= todayStart).length
  const sevenDayActive = allUsers.filter((u) => u.lastActivityAt && new Date(u.lastActivityAt) >= sevenDaysAgo).length

  return (
    <>
      <div className="page-header">
        <h1>Users</h1>
        <p>Read-only unified user view from profiles, roles, activity, study, and forum data.</p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-card-label">Total Users</div><div className="stat-card-value">{allUsers.length}</div></div>
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
            <a href="/users" style={{ background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>Clear</a>
          </div>
        </form>
      </div>

      {errors.length > 0 ? (
        <div className="placeholder-card" style={{ marginBottom: 16, borderColor: '#fde68a', background: '#fefce8' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#92400e' }}>Some data sources could not be loaded: {errors.slice(0, 3).join(' | ')}</p>
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
                  <tr key={user.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '9px 12px', maxWidth: 260 }}>
                      <div style={{ fontWeight: 700, wordBreak: 'break-word' }}>{user.email || user.userId || user.key}</div>
                      <div style={{ fontSize: 11, color: '#64748b', wordBreak: 'break-word' }}>{user.name || '-'}</div>
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ fontSize: 11, background: user.role === 'admin' ? '#dbeafe' : '#f1f5f9', color: user.role === 'admin' ? '#1d4ed8' : '#475569', borderRadius: 999, padding: '2px 8px', fontWeight: 700 }}>{user.role}</span>
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{formatTokyoDateTime(user.lastActivityAt)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>{user.forumPostCount} / {user.forumCommentCount}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>{user.visitorEventCount}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>{user.lessonProgressCount} / {user.attemptCount}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{formatTokyoDateTime(user.createdAt)}</td>
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
