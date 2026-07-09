import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

const VISITOR_SELECT = 'id,email,path,referrer,user_agent,ip,is_admin,workflow_skip_reason,workflow_instance_id,created_at'

type VisitorParams = {
  q?: string
  user?: string
  range?: string
  from?: string
  to?: string
  sort?: string
  page?: string
}

const USER_FILTERS = ['all', 'signed-in', 'anonymous', 'admin'] as const
const TIME_RANGES = ['1h', '24h', '7d', '30d', 'custom', 'all'] as const
const SORT_OPTIONS = ['created_desc', 'created_asc', 'email_asc', 'email_desc', 'path_asc', 'path_desc'] as const

function shorten(value: string | null | undefined, maxLength = 72) {
  const text = String(value || '').trim()
  if (!text) return '-'
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

function shortId(value: string | null | undefined) {
  const text = String(value || '').trim()
  if (!text) return '-'
  return text.length <= 8 ? text : text.slice(0, 8)
}

function getRangeStart(range: string, from?: string) {
  if (range === 'custom' && from) {
    const d = new Date(from)
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }
  const now = Date.now()
  if (range === '1h') return new Date(now - 60 * 60 * 1000).toISOString()
  if (range === '24h') return new Date(now - 24 * 60 * 60 * 1000).toISOString()
  if (range === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  if (range === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  return null
}

function buildHref(params: VisitorParams, updates: Partial<VisitorParams>) {
  const next = { ...params, ...updates }
  const q = new URLSearchParams()
  if (next.q) q.set('q', next.q)
  if (next.user && next.user !== 'all') q.set('user', next.user)
  if (next.range && next.range !== 'all') q.set('range', next.range)
  if (next.from) q.set('from', next.from)
  if (next.to) q.set('to', next.to)
  if (next.sort && next.sort !== 'created_desc') q.set('sort', next.sort)
  if (next.page && next.page !== '1') q.set('page', next.page)
  const query = q.toString()
  return `/visitors${query ? `?${query}` : ''}`
}

function toggleSort(current: string, asc: string, desc: string) {
  return current === desc ? asc : desc
}

function sortLabel(current: string, asc: string, desc: string, label: string) {
  if (current === asc) return `${label} ↑`
  if (current === desc) return `${label} ↓`
  return label
}

export default async function VisitorsPage({
  searchParams,
}: {
  searchParams: Promise<VisitorParams>
}) {
  const params = await searchParams
  const cookieStore = await cookies()

  const q = String(params.q || '').trim().slice(0, 120)
  const user = USER_FILTERS.includes(params.user as (typeof USER_FILTERS)[number]) ? String(params.user) : 'all'
  const range = TIME_RANGES.includes(params.range as (typeof TIME_RANGES)[number]) ? String(params.range) : 'all'
  const from = String(params.from || '').trim()
  const to = String(params.to || '').trim()
  const sort = SORT_OPTIONS.includes(params.sort as (typeof SORT_OPTIONS)[number]) ? String(params.sort) : 'created_desc'
  const pageRaw = Number(params.page || '1')
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1

  const supabase = createClient(cookieStore)

  let query = supabase
    .from('visitor_activity_events')
    .select(VISITOR_SELECT, { count: 'exact' })

  const rangeStart = getRangeStart(range, from)
  if (rangeStart) query = query.gte('created_at', rangeStart)
  if (range === 'custom' && to) {
    const end = new Date(to)
    if (Number.isFinite(end.getTime())) {
      const endNext = new Date(end.getTime() + 86400000)
      query = query.lt('created_at', endNext.toISOString())
    }
  }

  if (user === 'signed-in') query = query.not('email', 'is', null)
  else if (user === 'anonymous') query = query.is('email', null)
  else if (user === 'admin') query = query.eq('is_admin', true)

  if (q) {
    const escapedQ = q.replace(/[%_\\]/g, '\\$&')
    const ilikeClauses = [
      `email.ilike.%${escapedQ}%`,
      `path.ilike.%${escapedQ}%`,
      `referrer.ilike.%${escapedQ}%`,
      `user_agent.ilike.%${escapedQ}%`,
      `ip.ilike.%${escapedQ}%`,
      `workflow_skip_reason.ilike.%${escapedQ}%`,
    ]
    query = query.or(ilikeClauses.join(','))
  }

  const sortCol = sort.startsWith('created') ? 'created_at' : sort.startsWith('email') ? 'email' : 'path'
  const sortDir = sort.endsWith('_asc') ? true : false
  query = query.order(sortCol, { ascending: sortDir })

  const fromRow = (page - 1) * PAGE_SIZE
  const toRow = fromRow + PAGE_SIZE - 1

  let totalCount = 0
  let events: Array<{
    id: string
    email: string | null
    path: string | null
    referrer: string | null
    user_agent: string | null
    ip: string | null
    is_admin: boolean | null
    workflow_skip_reason: string | null
    workflow_instance_id: string | null
    created_at: string | null
  }> = []
  let errorMessage: string | null = null

  try {
    const { data, count, error } = await query.range(fromRow, toRow)
    if (error) {
      errorMessage = error.message
    } else {
      if (data) events = data as typeof events
      if (count !== null) totalCount = count
    }
  } catch (e) {
    errorMessage = String(e)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <>
      <div className="page-header">
        <h1>Visitors</h1>
        <p>Full visitor activity log with search, sort, pagination, and date filtering.</p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-card-label">Total Records</div>
          <div className="stat-card-value">{totalCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">This Page</div>
          <div className="stat-card-value">{events.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Pages</div>
          <div className="stat-card-value">{totalPages}</div>
        </div>
      </div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <form method="get" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Search</span>
            <input name="q" defaultValue={q} placeholder="email / path / IP / UA" style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>User</span>
            <select name="user" defaultValue={user} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              <option value="all">All</option>
              <option value="signed-in">Signed-in</option>
              <option value="anonymous">Anonymous</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Range</span>
            <select name="range" defaultValue={range} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              <option value="1h">Last hour</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="custom">Custom</option>
              <option value="all">All time</option>
            </select>
          </label>
          {range === 'custom' ? (
            <>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>From</span>
                <input name="from" type="date" defaultValue={from} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>To</span>
                <input name="to" type="date" defaultValue={to} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }} />
              </label>
            </>
          ) : null}
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Sort</span>
            <select name="sort" defaultValue={sort} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              <option value="created_desc">Time: newest</option>
              <option value="created_asc">Time: oldest</option>
              <option value="email_asc">Email A-Z</option>
              <option value="email_desc">Email Z-A</option>
              <option value="path_asc">Path A-Z</option>
              <option value="path_desc">Path Z-A</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', paddingBottom: 2 }}>
            <button type="submit" style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Apply</button>
            <Link href="/visitors" style={{ background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>Clear</Link>
          </div>
        </form>
      </div>

      <div className="placeholder-card" style={{ overflowX: 'auto', padding: 0 }}>
        {errorMessage ? (
          <p style={{ textAlign: 'center', padding: 24, color: '#dc2626', fontSize: 14 }}>
            {errorMessage}
          </p>
        ) : events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>No visitor records found.</p>
            <p style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', marginTop: 8 }}>
              Range: {range} | User: {user} | Search: &quot;{q}&quot; | Page: {page}
            </p>
            <p style={{ marginTop: 12 }}>
              <Link href="/visitors" style={{ color: '#3b82f6', fontSize: 14 }}>Clear filters</Link>
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1120 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                  <Link href={buildHref(params, { sort: toggleSort(sort, 'created_asc', 'created_desc'), page: '1' })} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {sortLabel(sort, 'created_asc', 'created_desc', 'Time')}
                  </Link>
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                  <Link href={buildHref(params, { sort: toggleSort(sort, 'email_asc', 'email_desc'), page: '1' })} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {sortLabel(sort, 'email_asc', 'email_desc', 'User')}
                  </Link>
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Auth</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                  <Link href={buildHref(params, { sort: toggleSort(sort, 'path_asc', 'path_desc'), page: '1' })} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {sortLabel(sort, 'path_asc', 'path_desc', 'Page')}
                  </Link>
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Referrer</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>IP</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Workflow</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>UA</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>
                    {formatTokyoDateTime(event.created_at)}
                  </td>
                  <td style={{ padding: '8px 12px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {event.email || <span style={{ color: '#94a3b8', fontSize: 12 }}>Anonymous</span>}
                  </td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {event.is_admin ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#dcfce7', color: '#166534', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px' }}>Admin</span>
                    ) : event.email ? (
                      <span style={{ fontSize: 10, color: '#64748b' }}>Signed-in</span>
                    ) : (
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>Guest</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px' }}><code style={{ fontSize: 11 }}>{event.path || '-'}</code></td>
                  <td style={{ padding: '8px 12px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b', fontSize: 12 }}>{shorten(event.referrer, 30)}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{shorten(event.ip, 15)}</td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {event.workflow_instance_id ? (
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#3b82f6' }} title={event.workflow_instance_id}>{shortId(event.workflow_instance_id)}</span>
                    ) : event.workflow_skip_reason ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#f1f5f9', color: '#475569', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px' }}>{event.workflow_skip_reason}</span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b', fontSize: 12 }}>{shorten(event.user_agent, 24)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 16 }}>
          {page > 1 ? (
            <Link href={buildHref(params, { page: String(page - 1) })} style={{ background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              Prev
            </Link>
          ) : null}
          <span style={{ padding: '8px 0', fontSize: 13, color: '#64748b' }}>
            Page {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={buildHref(params, { page: String(page + 1) })} style={{ background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
