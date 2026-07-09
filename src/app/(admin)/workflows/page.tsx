import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'

export const dynamic = 'force-dynamic'

const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
const STATUS_FILTERS = ['all', 'pending', 'running', 'completed', 'approved', 'rejected'] as const

const DEFINITIONS = [
  { key: 'study_visitor', name: 'Study Visitor Confirmation' },
  { key: 'logged_in_first_visit', name: 'First Visit Confirmation' },
  { key: 'membership_application', name: 'Membership Application' },
] as const

type WorkflowInstanceRow = {
  id: string
  workflow_version_id: string
  reference_type: string
  reference_id: string
  status: string
  current_node_key: string | null
  created_at: string | null
  updated_at: string | null
}

type WorkflowSearchParams = {
  definition_key?: string
  status?: string
  instanceId?: string
  page?: string
  pageSize?: string
}

function statusBadge(status: string) {
  if (status === 'approved' || status === 'completed')
    return { color: '#166534', background: '#dcfce7', border: '1px solid #86efac', label: 'Approved' }
  if (status === 'rejected')
    return { color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5', label: 'Rejected' }
  return { color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d', label: 'Pending' }
}

function shortId(value: string | null | undefined) {
  if (!value) return '-'
  return value.length > 8 ? value.slice(0, 8) + '...' : value
}

function buildHref(params: WorkflowSearchParams, updates: Partial<WorkflowSearchParams>) {
  const next = { ...params, ...updates }
  const q = new URLSearchParams()
  if (next.definition_key) q.set('definition_key', next.definition_key)
  if (next.status && next.status !== 'all') q.set('status', next.status)
  if (next.instanceId) q.set('instanceId', next.instanceId)
  if (next.page && next.page !== '1') q.set('page', next.page)
  if (next.pageSize && next.pageSize !== String(DEFAULT_PAGE_SIZE)) q.set('pageSize', next.pageSize)
  const query = q.toString()
  return `/workflows${query ? `?${query}` : ''}`
}

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<WorkflowSearchParams>
}) {
  const resolvedParams = await searchParams
  const definitionKey = resolvedParams.definition_key
  const statusParam = resolvedParams.status
  const instanceIdFilter = resolvedParams.instanceId
  const pageRaw = Number(resolvedParams.page || '1')
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
  const pageSizeRaw = Number(resolvedParams.pageSize || String(DEFAULT_PAGE_SIZE))
  const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw as (typeof PAGE_SIZE_OPTIONS)[number]) ? pageSizeRaw : DEFAULT_PAGE_SIZE
  const cookieStore = await cookies()

  const validKey = definitionKey && DEFINITIONS.some(d => d.key === definitionKey) ? definitionKey : null
  const statusFilter = STATUS_FILTERS.includes(statusParam as (typeof STATUS_FILTERS)[number]) ? String(statusParam) : 'all'
  const currentParams: WorkflowSearchParams = { definition_key: validKey || undefined, status: statusFilter, instanceId: instanceIdFilter, page: String(page), pageSize: String(pageSize) }

  const supabase = createClient(cookieStore)

  let totalPending = 0
  let studyVisitorPending = 0
  let loggedInPending = 0
  let membershipPending = 0
  let totalCount = 0
  let instances: WorkflowInstanceRow[] = []
  let errorMessage = ''
  const emailMap = new Map<string, string>()
  const emailStatusMap = new Map<string, { status: string; id: string }>()
  const fromRow = (page - 1) * pageSize
  const toRow = fromRow + pageSize - 1

  try {
    const { count: total } = await supabase
      .from('workflow_instances')
      .select('*', { count: 'exact', head: true })
      .in('status', ['running', 'pending'])
    totalPending = total ?? 0
  } catch {}

  for (const def of DEFINITIONS) {
    try {
      const { count } = await supabase
        .from('workflow_instances')
        .select('*', { count: 'exact', head: true })
        .eq('reference_type', def.key)
        .in('status', ['running', 'pending'])
      if (def.key === 'study_visitor') studyVisitorPending = count ?? 0
      else if (def.key === 'logged_in_first_visit') loggedInPending = count ?? 0
      else if (def.key === 'membership_application') membershipPending = count ?? 0
    } catch {}
  }

  try {
    let query = supabase
      .from('workflow_instances')
      .select('id,workflow_version_id,reference_type,reference_id,status,current_node_key,created_at,updated_at', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (validKey) {
      query = query.eq('reference_type', validKey)
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    if (instanceIdFilter) {
      query = query.eq('id', instanceIdFilter)
    }

    const { data, error, count } = await query.range(fromRow, toRow)
    if (error) errorMessage = error.message
    instances = (data || []) as WorkflowInstanceRow[]
    totalCount = count ?? 0

    const instanceIds = instances.map(i => i.id)

    if (instanceIds.length > 0) {
      const { data: events } = await supabase
        .from('visitor_activity_events')
        .select('workflow_instance_id, email')
        .in('workflow_instance_id', instanceIds)
        .not('workflow_instance_id', 'is', null)
      if (events) {
        for (const e of events) {
          if (e.workflow_instance_id && e.email) {
            emailMap.set(e.workflow_instance_id, e.email)
          }
        }
      }

      const { data: emailLogs } = await supabase
        .from('email_logs')
        .select('workflow_instance_id, status, id')
        .in('workflow_instance_id', instanceIds)
        .not('workflow_instance_id', 'is', null)

      if (emailLogs) {
        const byInstance = new Map<string, { status: string; id: string }>()
        for (const el of emailLogs) {
          if (el.workflow_instance_id && !byInstance.has(el.workflow_instance_id)) {
            byInstance.set(el.workflow_instance_id, { status: el.status, id: el.id })
          }
        }
        for (const [k, v] of byInstance) {
          emailStatusMap.set(k, v)
        }
      }
    }
  } catch (e) {
    errorMessage = String(e)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <>
      <div className="page-header">
        <h1>Workflows</h1>
        <p>Approval workflow instances and their current status.</p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-card-label">Total Records</div>
          <div className="stat-card-value">{totalCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">This Page</div>
          <div className="stat-card-value">{instances.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Pages</div>
          <div className="stat-card-value">{totalPages}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">All Pending</div>
          <div className="stat-card-value">{totalPending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Study Visitor</div>
          <div className="stat-card-value">{studyVisitorPending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Logged-in Visit</div>
          <div className="stat-card-value">{loggedInPending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Membership</div>
          <div className="stat-card-value">{membershipPending}</div>
        </div>
      </div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Definition</span>
            <select name="definition_key" defaultValue={definitionKey || ''} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              <option value="">All</option>
              {DEFINITIONS.map((def) => (
                <option key={def.key} value={def.key}>{def.name}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Status</span>
            <select name="status" defaultValue={statusFilter} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              <option value="all">All</option>
              <option value="pending">pending</option>
              <option value="running">running</option>
              <option value="completed">completed</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Page size</span>
            <select name="pageSize" defaultValue={pageSize} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 10px', font: 'inherit' }}>
              {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <button type="submit" style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Filter</button>
          {definitionKey || statusFilter !== 'all' ? (
            <Link href="/workflows" style={{ background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>Clear</Link>
          ) : null}
        </form>
      </div>

      <div className="placeholder-card" style={{ overflowX: 'auto', padding: 0 }}>
        {errorMessage ? (
          <p style={{ textAlign: 'center', padding: 24, color: '#dc2626', fontSize: 14 }}>{errorMessage}</p>
        ) : instances.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>No workflow instances found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1000 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Instance ID</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Definition</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Name</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Ref ID</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Email</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Email Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((instance) => {
                const badge = statusBadge(instance.status)
                const email = emailMap.get(instance.id) || ''
                return (
                  <tr key={instance.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }} title={instance.id}>
                      <Link href={`/workflows/${instance.id}`} style={{ color: '#3b82f6', fontWeight: 700 }}>{shortId(instance.id)}</Link>
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{instance.reference_type}</td>
                    <td style={{ padding: '8px 12px' }}>{DEFINITIONS.find(d => d.key === instance.reference_type)?.name || '-'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }} title={instance.reference_id}>{shortId(instance.reference_id)}</td>
                    <td style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email || '-'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ display: 'inline-flex', borderRadius: 999, padding: '4px 10px', fontWeight: 700, fontSize: 12, ...badge }}>{badge.label}</span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {(() => {
                        const es = emailStatusMap.get(instance.id)
                        if (!es) return <span style={{ fontSize: 12, color: '#94a3b8' }}>-</span>
                        const colors: Record<string, { color: string; bg: string }> = {
                          sent: { color: '#166534', bg: '#dcfce7' },
                          failed: { color: '#991b1b', bg: '#fee2e2' },
                          pending: { color: '#92400e', bg: '#fef3c7' },
                        }
                        const c = colors[es.status] || { color: '#64748b', bg: '#f1f5f9' }
                        return (
                          <span style={{ fontSize: 11, fontFamily: 'monospace', borderRadius: 999, padding: '2px 8px', fontWeight: 700, color: c.color, background: c.bg }}>
                            {es.status}
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontSize: 11 }}>{formatTokyoDateTime(instance.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
