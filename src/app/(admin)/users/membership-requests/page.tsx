import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'

export const dynamic = 'force-dynamic'

const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
const REQUEST_SELECT = 'id,user_id,current_level,requested_level,reason,status,reviewed_at,review_note,created_at,updated_at,reject_reason,workflow_instance_id'

type SearchParams = {
  q?: string
  status?: string
  requested?: string
  current?: string
  workflow?: string
  range?: string
  page?: string
  pageSize?: string
}

type MembershipRequest = {
  id: string
  user_id: string
  current_level: string
  requested_level: string
  reason: string | null
  status: string
  reviewed_at: string | null
  review_note: string | null
  created_at: string
  updated_at: string
  reject_reason: string | null
  workflow_instance_id: string | null
}

type WorkflowInstance = {
  id: string
  status: string
  current_node_key: string | null
  created_at: string
  updated_at: string
}

type Profile = { id: string; email: string | null; display_name: string | null }
type Role = { user_id: string; email: string | null }

function rangeStart(range: string) {
  const now = Date.now()
  if (range === '1h') return new Date(now - 60 * 60 * 1000).toISOString()
  if (range === '24h') return new Date(now - 24 * 60 * 60 * 1000).toISOString()
  if (range === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  if (range === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  return null
}

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase() || ''
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort()
}

function escapeSearch(value: string) {
  return value.replace(/[%_\\]/g, '\\$&')
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function buildHref(params: SearchParams, updates: Partial<SearchParams>) {
  const next = { ...params, ...updates }
  const q = new URLSearchParams()
  if (next.q) q.set('q', next.q)
  if (next.status && next.status !== 'all') q.set('status', next.status)
  if (next.requested && next.requested !== 'all') q.set('requested', next.requested)
  if (next.current && next.current !== 'all') q.set('current', next.current)
  if (next.workflow && next.workflow !== 'all') q.set('workflow', next.workflow)
  if (next.range && next.range !== 'all') q.set('range', next.range)
  if (next.page && next.page !== '1') q.set('page', next.page)
  if (next.pageSize && next.pageSize !== String(DEFAULT_PAGE_SIZE)) q.set('pageSize', next.pageSize)
  const query = q.toString()
  return `/users/membership-requests${query ? `?${query}` : ''}`
}

export default async function MembershipRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const q = String(params.q || '').trim().toLowerCase().slice(0, 120)
  const status = String(params.status || 'all').trim().slice(0, 80) || 'all'
  const requested = String(params.requested || 'all').trim().slice(0, 80) || 'all'
  const current = String(params.current || 'all').trim().slice(0, 80) || 'all'
  const workflow = String(params.workflow || 'all').trim().slice(0, 80) || 'all'
  const range = String(params.range || 'all')
  const pageRaw = Number(params.page || '1')
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
  const pageSizeRaw = Number(params.pageSize || String(DEFAULT_PAGE_SIZE))
  const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw as (typeof PAGE_SIZE_OPTIONS)[number]) ? pageSizeRaw : DEFAULT_PAGE_SIZE
  const currentParams: SearchParams = { q, status, requested, current, workflow, range, page: String(page), pageSize: String(pageSize) }
  const fromRow = (page - 1) * pageSize
  const toRow = fromRow + pageSize - 1

  let requests: MembershipRequest[] = []
  let requestTotal: number | null = null
  let optionRequests: Array<Pick<MembershipRequest, 'status' | 'current_level' | 'requested_level' | 'workflow_instance_id'>> = []
  let errorMessage: string | null = null
  let matchingUserIds: string[] = []
  let workflowFilterIds: string[] = []
  let workflowFilterEmpty = false

  if (q) {
    const search = escapeSearch(q)
    try {
      const [profileResult, roleResult] = await Promise.all([
        supabase.from('profiles').select('id').or(`email.ilike.%${search}%,display_name.ilike.%${search}%`).limit(200),
        supabase.from('user_roles').select('user_id,email').ilike('email', `%${search}%`).limit(200),
      ])
      const profileIds = ((profileResult.data || []) as Array<{ id: string }>).map((profile) => profile.id)
      const roleIds = ((roleResult.data || []) as Array<{ user_id: string }>).map((role) => role.user_id)
      matchingUserIds = unique([...profileIds, ...roleIds])
    } catch {}
  }

  if (workflow !== 'all') {
    try {
      const { data, error } = await supabase.from('workflow_instances').select('id').eq('status', workflow).limit(10000)
      if (error) errorMessage = error.message
      else {
        workflowFilterIds = unique(((data || []) as Array<{ id: string }>).map((w) => w.id))
        workflowFilterEmpty = workflowFilterIds.length === 0
      }
    } catch (e) {
      errorMessage = String(e)
    }
  }

  if (!errorMessage && !workflowFilterEmpty) {
    try {
      let query = supabase
        .from('membership_requests')
        .select(REQUEST_SELECT, { count: 'exact' })
        .order('created_at', { ascending: false })

      const start = rangeStart(range)
      if (start) query = query.gte('created_at', start)
      if (status !== 'all') query = query.eq('status', status)
      if (requested !== 'all') query = query.eq('requested_level', requested)
      if (current !== 'all') query = query.eq('current_level', current)
      if (workflow !== 'all') query = query.in('workflow_instance_id', workflowFilterIds)
      if (q) {
        const search = escapeSearch(q)
        const qParts = [
          `reason.ilike.%${search}%`,
          `review_note.ilike.%${search}%`,
          `reject_reason.ilike.%${search}%`,
        ]
        if (isUuid(q)) qParts.push(`id.eq.${q}`, `user_id.eq.${q}`)
        if (matchingUserIds.length > 0) qParts.push(`user_id.in.(${matchingUserIds.join(',')})`)
        query = query.or(qParts.join(','))
      }

      const { data, error, count } = await query.range(fromRow, toRow)
      if (error) errorMessage = error.message
      else {
        requests = (data || []) as MembershipRequest[]
        requestTotal = count
      }
    } catch (e) {
      errorMessage = String(e)
    }
  } else if (workflowFilterEmpty) {
    requestTotal = 0
  }

  if (!errorMessage) {
    try {
      let optionsQuery = supabase
        .from('membership_requests')
        .select('status,current_level,requested_level,workflow_instance_id')
        .order('created_at', { ascending: false })

      const start = rangeStart(range)
      if (start) optionsQuery = optionsQuery.gte('created_at', start)

      const { data } = await optionsQuery.limit(500)
      optionRequests = (data || []) as Array<Pick<MembershipRequest, 'status' | 'current_level' | 'requested_level' | 'workflow_instance_id'>>
    } catch {}
  }

  const userIds = unique(requests.map((r) => r.user_id))
  const workflowIds = unique([...requests.map((r) => r.workflow_instance_id), ...optionRequests.map((r) => r.workflow_instance_id)])
  const profileMap = new Map<string, Profile>()
  const roleEmailMap = new Map<string, string>()
  const workflowMap = new Map<string, WorkflowInstance>()

  if (userIds.length > 0) {
    try {
      const { data } = await supabase.from('profiles').select('id,email,display_name').in('id', userIds)
      ;((data || []) as Profile[]).forEach((p) => profileMap.set(p.id, p))
    } catch {}

    try {
      const { data } = await supabase.from('user_roles').select('user_id,email').in('user_id', userIds)
      ;((data || []) as Role[]).forEach((r) => {
        if (r.email) roleEmailMap.set(r.user_id, r.email)
      })
    } catch {}
  }

  if (workflowIds.length > 0) {
    try {
      const { data } = await supabase.from('workflow_instances').select('id,status,current_node_key,created_at,updated_at').in('id', workflowIds)
      ;((data || []) as WorkflowInstance[]).forEach((w) => workflowMap.set(w.id, w))
    } catch {}
  }

  const statusOptions = unique([...optionRequests.map((r) => r.status), status !== 'all' ? status : null])
  const requestedOptions = unique([...optionRequests.map((r) => r.requested_level), requested !== 'all' ? requested : null])
  const currentOptions = unique([...optionRequests.map((r) => r.current_level), current !== 'all' ? current : null])
  const workflowOptions = unique([...Array.from(workflowMap.values()).map((w) => w.status), workflow !== 'all' ? workflow : null])
  const totalCount = requestTotal ?? requests.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const pendingCount = requests.filter((r) => ['pending', 'submitted', 'in_review'].includes(normalized(r.status))).length
  const approvedCount = requests.filter((r) => ['approved', 'approve', 'completed'].includes(normalized(r.status))).length
  const rejectedCount = requests.filter((r) => ['rejected', 'reject', 'denied'].includes(normalized(r.status))).length

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href="/users" style={{ color: '#64748b', fontSize: 13 }}>← Back to Users</Link>
      </div>

      <div className="page-header">
        <h1>Membership Requests</h1>
        <p>Read-only membership and VIP request tracking with workflow status.</p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-card-label">Total Results</div><div className="stat-card-value">{totalCount}</div></div>
        <div className="stat-card"><div className="stat-card-label">Page Results</div><div className="stat-card-value">{requests.length}</div></div>
        <div className="stat-card"><div className="stat-card-label">Pages</div><div className="stat-card-value">{totalPages}</div></div>
        <div className="stat-card"><div className="stat-card-label">Page Pending</div><div className="stat-card-value">{pendingCount}</div></div>
        <div className="stat-card"><div className="stat-card-label">Page Approved</div><div className="stat-card-value">{approvedCount}</div></div>
        <div className="stat-card"><div className="stat-card-label">Page Rejected</div><div className="stat-card-value">{rejectedCount}</div></div>
      </div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <form method="get" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Search</span><input name="q" defaultValue={q} placeholder="email / reason / user id" style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }} /></label>
          <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Status</span><select name="status" defaultValue={status} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}><option value="all">All</option>{statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
          <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Requested</span><select name="requested" defaultValue={requested} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}><option value="all">All</option>{requestedOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
          <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Current</span><select name="current" defaultValue={current} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}><option value="all">All</option>{currentOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
          <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Workflow</span><select name="workflow" defaultValue={workflow} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}><option value="all">All</option>{workflowOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
          <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Range</span><select name="range" defaultValue={range} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}><option value="all">All time</option><option value="1h">Last hour</option><option value="24h">Last 24h</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>
          <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Page size</span><select name="pageSize" defaultValue={pageSize} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>{PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="submit" style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Apply</button><Link href="/users/membership-requests" style={{ background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14 }}>Clear</Link></div>
        </form>
      </div>

      <div className="placeholder-card" style={{ overflowX: 'auto', padding: 0 }}>
        {errorMessage ? (
          <p style={{ textAlign: 'center', padding: 24, color: '#dc2626', fontSize: 14 }}>Error: {errorMessage}</p>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24 }}><p style={{ color: '#94a3b8', fontSize: 14 }}>No membership requests found.</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1100 }}>
              <thead><tr style={{ borderBottom: '2px solid #e2e8f0' }}><th style={{ padding: 10, textAlign: 'left' }}>Applicant</th><th style={{ padding: 10, textAlign: 'left' }}>Level</th><th style={{ padding: 10, textAlign: 'left' }}>Status</th><th style={{ padding: 10, textAlign: 'left' }}>Workflow</th><th style={{ padding: 10, textAlign: 'left' }}>Reason</th><th style={{ padding: 10, textAlign: 'left' }}>Created</th><th style={{ padding: 10, textAlign: 'left' }}>Updated</th></tr></thead>
              <tbody>{requests.map((r) => {
                const profile = profileMap.get(r.user_id)
                const email = profile?.email || roleEmailMap.get(r.user_id)
                const wf = r.workflow_instance_id ? workflowMap.get(r.workflow_instance_id) : null
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: 10, maxWidth: 220 }}><Link href={`/users/${encodeURIComponent(`id:${r.user_id}`)}`} style={{ color: '#3b82f6', fontWeight: 700, wordBreak: 'break-word' }}>{email || r.user_id}</Link><div style={{ fontSize: 11, color: '#64748b', wordBreak: 'break-word' }}>{profile?.display_name || r.user_id}</div></td>
                    <td style={{ padding: 10, whiteSpace: 'nowrap' }}>
                      <Link href={`/users/membership-requests/${r.id}`} style={{ color: '#3b82f6', fontWeight: 700 }}>
                        {r.current_level} → {r.requested_level}
                      </Link>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{r.id.slice(0, 8)}...</div>
                    </td>
                    <td style={{ padding: 10 }}><span style={{ fontSize: 11, background: '#f1f5f9', borderRadius: 999, padding: '2px 8px', fontWeight: 700 }}>{r.status}</span></td>
                    <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{wf?.status || '-'}<div style={{ fontSize: 11, color: '#64748b' }}>{wf?.current_node_key || '-'}</div></td>
                    <td style={{ padding: 10, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || r.review_note || r.reject_reason || '-'}</td>
                    <td style={{ padding: 10, whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{formatTokyoDateTime(r.created_at)}</td>
                    <td style={{ padding: 10, whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{formatTokyoDateTime(r.updated_at)}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}
      </div>

      {!errorMessage ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 16 }}>
          <div style={{ color: '#64748b', fontSize: 13 }}>Page {page} of {totalPages} | Total {totalCount}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href={buildHref(currentParams, { page: String(page - 1) })} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 12px', color: page > 1 ? '#3b82f6' : '#94a3b8', pointerEvents: page > 1 ? 'auto' : 'none', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Previous</Link>
            <Link href={buildHref(currentParams, { page: String(page + 1) })} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 12px', color: page < totalPages ? '#3b82f6' : '#94a3b8', pointerEvents: page < totalPages ? 'auto' : 'none', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Next</Link>
          </div>
        </div>
      ) : null}
    </>
  )
}
