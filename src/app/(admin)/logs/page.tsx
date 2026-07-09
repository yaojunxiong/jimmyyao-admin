import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'

export const dynamic = 'force-dynamic'

type ActivityRow = {
  id: string
  user_id: string | null
  email: string | null
  path: string | null
  page_type: string | null
  lesson_no: number | null
  referrer: string | null
  user_agent: string | null
  ip: string | null
  is_admin: boolean | null
  workflow_skip_reason: string | null
  workflow_instance_id: string | null
  created_at: string | null
}

type EmailLogRow = {
  id: string
  workflow_instance_id: string | null
  reference_id: string | null
  status: string | null
  template_key: string | null
  notification_type: string | null
  recipient_email: string | null
  to_email: string | null
  subject: string | null
  error_message: string | null
  sent_at: string | null
  failed_at: string | null
  created_at: string | null
}

type LogsSearchParams = {
  tab?: string
  q?: string
  user?: string
  range?: string
  type?: string
  lesson?: string
  sort?: string
  status?: string
  template?: string
}

const activitySelect = 'id,user_id,email,path,page_type,lesson_no,referrer,user_agent,ip,is_admin,workflow_skip_reason,workflow_instance_id,created_at'
const emailLogSelect = 'id,workflow_instance_id,reference_id,status,template_key,notification_type,recipient_email,to_email,subject,error_message,sent_at,failed_at,created_at'
const PAGE_TYPES = ['all', 'home', 'login', 'lessons', 'lesson', 'admin', 'toolbox', 'me', 'other'] as const
const USER_FILTERS = ['all', 'signed-in', 'anonymous', 'admin'] as const
const TIME_RANGES = ['1h', '24h', '7d', 'all'] as const
const ACTIVITY_SORT_OPTIONS = ['created_desc', 'created_asc', 'email_asc', 'email_desc', 'path_asc', 'path_desc', 'type_asc', 'type_desc', 'lesson_asc', 'lesson_desc'] as const
const EMAIL_SORT_OPTIONS = ['created_desc', 'created_asc', 'failed_desc', 'failed_asc', 'sent_desc', 'sent_asc'] as const

function getParams(params: LogsSearchParams) {
  const tab = params.tab === 'email' ? 'email' : 'activity'
  const q = String(params.q || '').trim().slice(0, 120)
  const user = USER_FILTERS.includes(params.user as (typeof USER_FILTERS)[number]) ? String(params.user) : 'all'
  const range = TIME_RANGES.includes(params.range as (typeof TIME_RANGES)[number]) ? String(params.range) : 'all'
  const type = PAGE_TYPES.includes(params.type as (typeof PAGE_TYPES)[number]) ? String(params.type) : 'all'
  const lessonRaw = Number(params.lesson || '')
  const lesson = Number.isFinite(lessonRaw) && lessonRaw >= 1 && lessonRaw <= 50 ? Math.floor(lessonRaw) : null
  const activitySort = ACTIVITY_SORT_OPTIONS.includes(params.sort as (typeof ACTIVITY_SORT_OPTIONS)[number]) ? String(params.sort) : 'created_desc'
  const emailSort = EMAIL_SORT_OPTIONS.includes(params.sort as (typeof EMAIL_SORT_OPTIONS)[number]) ? String(params.sort) : 'created_desc'
  const status = String(params.status || 'all').trim().slice(0, 80) || 'all'
  const template = String(params.template || 'all').trim().slice(0, 120) || 'all'
  return { tab, q, user, range, type, lesson, activitySort, emailSort, status, template }
}

function getRangeStart(range: string) {
  const now = Date.now()
  if (range === '1h') return now - 60 * 60 * 1000
  if (range === '24h') return now - 24 * 60 * 60 * 1000
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000
  return null
}

function normalizeType(value: string | null | undefined) {
  const type = String(value || '').trim()
  if (['home', 'login', 'lessons', 'lesson', 'admin', 'toolbox', 'me'].includes(type)) return type
  return 'other'
}

function filterEvents(events: ActivityRow[], filters: ReturnType<typeof getParams>) {
  const searchTerm = filters.q.toLowerCase()
  const rangeStart = getRangeStart(filters.range)
  return events.filter((event) => {
    if (filters.user === 'signed-in' && !event.email) return false
    if (filters.user === 'anonymous' && event.email) return false
    if (filters.user === 'admin' && !event.is_admin) return false
    if (filters.type !== 'all' && normalizeType(event.page_type) !== filters.type) return false
    if (filters.lesson && event.lesson_no !== filters.lesson) return false
    if (rangeStart) {
      const created = new Date(event.created_at || '').getTime()
      if (!Number.isFinite(created) || created < rangeStart) return false
    }
    if (!searchTerm) return true
    return [event.email, event.path, event.page_type, event.user_agent, event.ip, event.workflow_skip_reason, event.workflow_instance_id]
      .some((value) => String(value || '').toLowerCase().includes(searchTerm))
  })
}

function sortEvents(events: ActivityRow[], sort: string) {
  const copy = events.slice()
  copy.sort((a, b) => {
    if (sort === 'created_asc') return new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()
    if (sort === 'email_asc') return String(a.email || '').localeCompare(String(b.email || ''))
    if (sort === 'email_desc') return String(b.email || '').localeCompare(String(a.email || ''))
    if (sort === 'path_asc') return String(a.path || '').localeCompare(String(b.path || ''))
    if (sort === 'path_desc') return String(b.path || '').localeCompare(String(a.path || ''))
    if (sort === 'type_asc') return String(a.page_type || '').localeCompare(String(b.page_type || ''))
    if (sort === 'type_desc') return String(b.page_type || '').localeCompare(String(a.page_type || ''))
    if (sort === 'lesson_asc') return (typeof a.lesson_no === 'number' ? a.lesson_no : Number.POSITIVE_INFINITY) - (typeof b.lesson_no === 'number' ? b.lesson_no : Number.POSITIVE_INFINITY)
    if (sort === 'lesson_desc') return (typeof b.lesson_no === 'number' ? b.lesson_no : Number.NEGATIVE_INFINITY) - (typeof a.lesson_no === 'number' ? a.lesson_no : Number.NEGATIVE_INFINITY)
    return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
  })
  return copy
}

function buildActivityHref(filters: ReturnType<typeof getParams>, updates: Partial<ReturnType<typeof getParams>>) {
  const next = { ...filters, ...updates }
  const q = new URLSearchParams()
  if (next.q) q.set('q', next.q)
  if (next.user !== 'all') q.set('user', next.user)
  if (next.range !== 'all') q.set('range', next.range)
  if (next.type !== 'all') q.set('type', next.type)
  if (next.lesson) q.set('lesson', String(next.lesson))
  if (next.activitySort !== 'created_desc') q.set('sort', next.activitySort)
  const query = q.toString()
  return `/logs${query ? `?${query}` : ''}`
}

function buildEmailHref(filters: ReturnType<typeof getParams>, updates: Partial<ReturnType<typeof getParams>>) {
  const next = { ...filters, ...updates }
  const q = new URLSearchParams()
  q.set('tab', 'email')
  if (next.q) q.set('q', next.q)
  if (next.range !== 'all') q.set('range', next.range)
  if (next.status !== 'all') q.set('status', next.status)
  if (next.template !== 'all') q.set('template', next.template)
  if (next.emailSort !== 'created_desc') q.set('sort', next.emailSort)
  return `/logs?${q.toString()}`
}

function sortLinkLabel(current: string, asc: string, desc: string, label: string) {
  if (current === asc) return `${label} ↑`
  if (current === desc) return `${label} ↓`
  return label
}

function nextSort(current: string, asc: string, desc: string) {
  return current === desc ? asc : desc
}

function shorten(value: string | null | undefined, maxLength = 72) {
  const text = String(value || '').trim()
  if (!text) return '-'
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

function tabLink(active: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 999,
    padding: '8px 12px',
    background: active ? '#dbeafe' : '#ffffff',
    color: active ? '#1d4ed8' : '#64748b',
    border: `1px solid ${active ? '#bfdbfe' : '#e2e8f0'}`,
    fontSize: 13,
    fontWeight: 800,
    textDecoration: 'none',
  }
}

export default async function LogsPage({ searchParams }: { searchParams: Promise<LogsSearchParams> }) {
  const filters = getParams(await searchParams)
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  let events: ActivityRow[] = []
  let activityError: string | null = null
  let emailLogs: EmailLogRow[] = []
  let emailError: string | null = null

  if (filters.tab === 'activity') {
    try {
      const { data, error } = await supabase.from('visitor_activity_events').select(activitySelect).order('created_at', { ascending: false }).limit(300)
      if (error) activityError = error.message
      else events = (data || []) as ActivityRow[]
    } catch (e) {
      activityError = String(e)
    }
  } else {
    try {
      const sortColumn = filters.emailSort.startsWith('failed_') ? 'failed_at' : filters.emailSort.startsWith('sent_') ? 'sent_at' : 'created_at'
      const ascending = filters.emailSort.endsWith('_asc')
      let query = supabase.from('email_logs').select(emailLogSelect).order(sortColumn, { ascending, nullsFirst: false }).limit(300)
      const rangeStart = getRangeStart(filters.range)
      if (rangeStart) query = query.gte('created_at', new Date(rangeStart).toISOString())
      if (filters.status !== 'all') query = query.eq('status', filters.status)
      if (filters.template !== 'all') query = query.or(`template_key.eq.${filters.template},notification_type.eq.${filters.template}`)
      if (filters.q) {
        const escaped = filters.q.replace(/[%_\\]/g, '\\$&')
        query = query.or(`recipient_email.ilike.%${escaped}%,to_email.ilike.%${escaped}%,subject.ilike.%${escaped}%,error_message.ilike.%${escaped}%,workflow_instance_id.ilike.%${escaped}%`)
      }
      const { data, error } = await query
      if (error) emailError = error.message
      else emailLogs = (data || []) as EmailLogRow[]
    } catch (e) {
      emailError = String(e)
    }
  }

  const filteredEvents = sortEvents(filterEvents(events, filters), filters.activitySort)
  const signedInCount = filteredEvents.filter((event) => !!event.email).length
  const anonymousCount = filteredEvents.length - signedInCount
  const adminCount = filteredEvents.filter((event) => event.is_admin).length
  const uniqueUsers = new Set(filteredEvents.filter((event) => !!event.email).map((event) => event.email)).size
  const emailStatuses = Array.from(new Set(emailLogs.map((log) => log.status).filter(Boolean) as string[])).sort()
  const emailTemplates = Array.from(new Set(emailLogs.map((log) => log.template_key || log.notification_type).filter(Boolean) as string[])).sort()
  const failedEmailCount = emailLogs.filter((log) => ['failed', 'error'].includes(String(log.status || '').toLowerCase())).length
  const sentEmailCount = emailLogs.filter((log) => !!log.sent_at).length

  return (
    <>
      <div className="page-header">
        <h1>Logs</h1>
        <p>Read-only activity and email delivery logs.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Link href="/logs" style={tabLink(filters.tab === 'activity')}>Activity Events</Link>
        <Link href="/logs?tab=email" style={tabLink(filters.tab === 'email')}>Email Logs</Link>
      </div>

      {filters.tab === 'activity' ? (
        activityError ? (
          <div className="placeholder-card"><h2>Activity Events Error</h2><p style={{ color: '#dc2626' }}>{activityError}</p></div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 16 }}>
              <div className="stat-card"><div className="stat-card-label">Filtered Results</div><div className="stat-card-value">{filteredEvents.length}</div></div>
              <div className="stat-card"><div className="stat-card-label">Signed-in Visits</div><div className="stat-card-value">{signedInCount}</div></div>
              <div className="stat-card"><div className="stat-card-label">Anonymous Visits</div><div className="stat-card-value">{anonymousCount}</div></div>
              <div className="stat-card"><div className="stat-card-label">Admin Visits</div><div className="stat-card-value">{adminCount}</div></div>
              <div className="stat-card"><div className="stat-card-label">Unique Users</div><div className="stat-card-value">{uniqueUsers}</div></div>
            </div>

            <div className="placeholder-card" style={{ marginBottom: 16 }}>
              <form method="get" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Search email / path / type / UA / IP</span><input name="q" defaultValue={filters.q} placeholder="/lessons" style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }} /></label>
                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>User</span><select name="user" defaultValue={filters.user} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}><option value="all">All</option><option value="signed-in">Signed-in</option><option value="anonymous">Anonymous</option><option value="admin">Admin</option></select></label>
                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Time range</span><select name="range" defaultValue={filters.range} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}><option value="1h">Last 1 hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="all">All</option></select></label>
                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Page type</span><select name="type" defaultValue={filters.type} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}><option value="all">All</option><option value="home">home</option><option value="login">login</option><option value="lessons">lessons</option><option value="lesson">lesson</option><option value="admin">admin</option><option value="toolbox">toolbox</option><option value="me">me</option><option value="other">Other</option></select></label>
                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Lesson no.</span><input name="lesson" type="number" min="1" max="50" defaultValue={filters.lesson || ''} placeholder="1" style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }} /></label>
                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Sort</span><select name="sort" defaultValue={filters.activitySort} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}><option value="created_desc">Time: newest first</option><option value="created_asc">Time: oldest first</option><option value="email_asc">User: email A-Z</option><option value="email_desc">User: email Z-A</option><option value="path_asc">Path A-Z</option><option value="path_desc">Path Z-A</option><option value="type_asc">Page type A-Z</option><option value="type_desc">Page type Z-A</option><option value="lesson_asc">Lesson: ascending</option><option value="lesson_desc">Lesson: descending</option></select></label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="submit" style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Apply</button><Link href="/logs" style={{ background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>Clear</Link></div>
              </form>
            </div>

            <div className="placeholder-card" style={{ overflowX: 'auto', padding: 0 }}>
              <h2 style={{ margin: 0, padding: '16px 16px 0', fontSize: 16, fontWeight: 700 }}>Activity Events ({filteredEvents.length}/{events.length})</h2>
              {filteredEvents.length === 0 ? <div style={{ textAlign: 'center', padding: 24 }}><p style={{ color: '#94a3b8', fontSize: 14 }}>No matching activity records found.</p><p style={{ marginTop: 12 }}><Link href="/logs" style={{ color: '#3b82f6', fontSize: 14 }}>Clear filters</Link></p></div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1200, marginTop: 12 }}>
                  <thead><tr style={{ borderBottom: '2px solid #e2e8f0' }}><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}><Link href={buildActivityHref(filters, { activitySort: nextSort(filters.activitySort, 'created_asc', 'created_desc') })} style={{ color: 'inherit', textDecoration: 'none' }}>{sortLinkLabel(filters.activitySort, 'created_asc', 'created_desc', 'Time')}</Link></th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>User</th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>Auth</th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>Path</th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>Type</th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>Lesson</th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>IP</th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>Workflow</th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>UA</th></tr></thead>
                  <tbody>{filteredEvents.map((event) => <tr key={event.id} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{formatTokyoDateTime(event.created_at)}</td><td style={{ padding: '8px 12px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.email || <span style={{ color: '#94a3b8', fontSize: 12 }}>Anonymous</span>}</td><td style={{ padding: '8px 12px' }}>{event.is_admin ? 'Admin' : event.email ? 'User' : 'Guest'}</td><td style={{ padding: '8px 12px' }}><code style={{ fontSize: 11 }}>{event.path || '-'}</code></td><td style={{ padding: '8px 12px', fontSize: 11 }}>{event.page_type || '-'}</td><td style={{ padding: '8px 12px', fontSize: 11 }}>{event.lesson_no ?? '-'}</td><td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{shorten(event.ip, 15) || '-'}</td><td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{event.workflow_instance_id ? <Link href={`/workflows/${event.workflow_instance_id}`} style={{ fontFamily: 'monospace', fontSize: 11, color: '#3b82f6' }}>{shorten(event.workflow_instance_id, 8)}</Link> : event.workflow_skip_reason || '-'}</td><td style={{ padding: '8px 12px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b', fontSize: 12 }}>{shorten(event.user_agent, 24)}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          </>
        )
      ) : (
        emailError ? (
          <div className="placeholder-card"><h2>Email Logs Error</h2><p style={{ color: '#dc2626' }}>{emailError}</p></div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 16 }}>
              <div className="stat-card"><div className="stat-card-label">Filtered Results</div><div className="stat-card-value">{emailLogs.length}</div></div>
              <div className="stat-card"><div className="stat-card-label">Failed / Error</div><div className="stat-card-value">{failedEmailCount}</div></div>
              <div className="stat-card"><div className="stat-card-label">Sent</div><div className="stat-card-value">{sentEmailCount}</div></div>
            </div>

            <div className="placeholder-card" style={{ marginBottom: 16 }}>
              <form method="get" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', alignItems: 'end' }}>
                <input type="hidden" name="tab" value="email" />
                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Search recipient / subject / error / workflow</span><input name="q" defaultValue={filters.q} placeholder="failed@example.com" style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }} /></label>
                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Status</span><select name="status" defaultValue={filters.status} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}><option value="all">All</option>{emailStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Template / Type</span><select name="template" defaultValue={filters.template} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}><option value="all">All</option>{emailTemplates.map((template) => <option key={template} value={template}>{template}</option>)}</select></label>
                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Time range</span><select name="range" defaultValue={filters.range} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}><option value="1h">Last 1 hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="all">All</option></select></label>
                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Sort</span><select name="sort" defaultValue={filters.emailSort} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}><option value="created_desc">Created: newest first</option><option value="created_asc">Created: oldest first</option><option value="failed_desc">Failed: newest first</option><option value="failed_asc">Failed: oldest first</option><option value="sent_desc">Sent: newest first</option><option value="sent_asc">Sent: oldest first</option></select></label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="submit" style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Apply</button><Link href="/logs?tab=email" style={{ background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>Clear</Link></div>
              </form>
            </div>

            <div className="placeholder-card" style={{ overflowX: 'auto', padding: 0 }}>
              <h2 style={{ margin: 0, padding: '16px 16px 0', fontSize: 16, fontWeight: 700 }}>Email Logs ({emailLogs.length})</h2>
              {emailLogs.length === 0 ? <div style={{ textAlign: 'center', padding: 24 }}><p style={{ color: '#94a3b8', fontSize: 14 }}>No matching email logs found.</p><p style={{ marginTop: 12 }}><Link href="/logs?tab=email" style={{ color: '#3b82f6', fontSize: 14 }}>Clear filters</Link></p></div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1280, marginTop: 12 }}>
                  <thead><tr style={{ borderBottom: '2px solid #e2e8f0' }}><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>Status</th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>Recipient</th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>Template</th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>Subject</th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>Error</th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>Workflow</th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}><Link href={buildEmailHref(filters, { emailSort: nextSort(filters.emailSort, 'created_asc', 'created_desc') })} style={{ color: 'inherit', textDecoration: 'none' }}>{sortLinkLabel(filters.emailSort, 'created_asc', 'created_desc', 'Created')}</Link></th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}><Link href={buildEmailHref(filters, { emailSort: nextSort(filters.emailSort, 'sent_asc', 'sent_desc') })} style={{ color: 'inherit', textDecoration: 'none' }}>{sortLinkLabel(filters.emailSort, 'sent_asc', 'sent_desc', 'Sent')}</Link></th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}><Link href={buildEmailHref(filters, { emailSort: nextSort(filters.emailSort, 'failed_asc', 'failed_desc') })} style={{ color: 'inherit', textDecoration: 'none' }}>{sortLinkLabel(filters.emailSort, 'failed_asc', 'failed_desc', 'Failed')}</Link></th><th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569' }}>Detail</th></tr></thead>
                  <tbody>{emailLogs.map((log) => <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: '8px 12px', fontWeight: 700 }}>{log.status || '-'}</td><td style={{ padding: '8px 12px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.recipient_email || log.to_email || '-'}</td><td style={{ padding: '8px 12px' }}>{log.template_key || log.notification_type || '-'}</td><td style={{ padding: '8px 12px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.subject || '-'}</td><td style={{ padding: '8px 12px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#991b1b' }}>{shorten(log.error_message, 80)}</td><td style={{ padding: '8px 12px' }}>{log.workflow_instance_id ? <Link href={`/workflows/${log.workflow_instance_id}`} style={{ color: '#3b82f6', fontFamily: 'monospace', fontSize: 11 }}>{shorten(log.workflow_instance_id, 8)}</Link> : '-'}</td><td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{formatTokyoDateTime(log.created_at)}</td><td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{formatTokyoDateTime(log.sent_at)}</td><td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{formatTokyoDateTime(log.failed_at)}</td><td style={{ padding: '8px 12px' }}><Link href={`/logs/email/${log.id}`} style={{ color: '#3b82f6', fontWeight: 700 }}>Open</Link></td></tr>)}</tbody>
                </table>
              )}
            </div>
          </>
        )
      )}
    </>
  )
}
