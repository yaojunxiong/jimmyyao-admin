import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'

export const dynamic = 'force-dynamic'

type RequestRow = {
  id: string
  user_id: string
  current_level: string
  requested_level: string
  reason: string | null
  status: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  reject_reason: string | null
  workflow_version_id: string | null
  workflow_instance_id: string | null
  created_at: string
  updated_at: string
}

type Profile = { id: string; email: string | null; display_name: string | null }
type Role = { user_id: string; email: string | null; role: string; vip_until: string | null }
type WorkflowInstance = { id: string; workflow_version_id: string; reference_type: string; reference_id: string; current_node_key: string | null; status: string; created_at: string; updated_at: string }
type WorkflowTask = { id: string; node_key: string; node_name: string; assignee_type: string | null; assignee_value: string | null; status: string; created_at: string; completed_at: string | null; completed_by: string | null }
type WorkflowAction = { id: string; actor_user_id: string | null; action: string; from_node_key: string | null; to_node_key: string | null; comment: string | null; created_at: string }
type EmailLog = { id: string; to_email: string; recipient_email: string | null; subject: string; template_key: string | null; notification_type: string | null; status: string; error_message: string | null; sent_at: string | null; failed_at: string | null; created_at: string }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="placeholder-card" style={{ overflowX: 'auto', padding: 0, marginBottom: 16 }}><h2 style={{ margin: 0, padding: '16px 16px 0', fontSize: 16, fontWeight: 700 }}>{title}</h2>{children}</div>
}

function Empty({ text }: { text: string }) {
  return <p style={{ padding: 16, fontSize: 13, color: '#94a3b8' }}>{text}</p>
}

export default async function MembershipRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  let request: RequestRow | null = null
  let profile: Profile | null = null
  let role: Role | null = null
  let workflow: WorkflowInstance | null = null
  let tasks: WorkflowTask[] = []
  let actions: WorkflowAction[] = []
  let emails: EmailLog[] = []
  let errorMessage: string | null = null

  try {
    const { data, error } = await supabase
      .from('membership_requests')
      .select('id,user_id,current_level,requested_level,reason,status,reviewed_by,reviewed_at,review_note,reject_reason,workflow_version_id,workflow_instance_id,created_at,updated_at')
      .eq('id', id)
      .maybeSingle()
    if (error) errorMessage = error.message
    else request = data as RequestRow | null
  } catch (e) {
    errorMessage = String(e)
  }

  if (request) {
    try {
      const { data } = await supabase.from('profiles').select('id,email,display_name').eq('id', request.user_id).maybeSingle()
      profile = data as Profile | null
    } catch {}

    try {
      const { data } = await supabase.from('user_roles').select('user_id,email,role,vip_until').eq('user_id', request.user_id).maybeSingle()
      role = data as Role | null
    } catch {}

    if (request.workflow_instance_id) {
      try {
        const { data } = await supabase.from('workflow_instances').select('id,workflow_version_id,reference_type,reference_id,current_node_key,status,created_at,updated_at').eq('id', request.workflow_instance_id).maybeSingle()
        workflow = data as WorkflowInstance | null
      } catch {}

      try {
        const { data } = await supabase.from('workflow_tasks').select('id,node_key,node_name,assignee_type,assignee_value,status,created_at,completed_at,completed_by').eq('workflow_instance_id', request.workflow_instance_id).order('created_at', { ascending: true })
        tasks = (data || []) as WorkflowTask[]
      } catch {}

      try {
        const { data } = await supabase.from('workflow_actions').select('id,actor_user_id,action,from_node_key,to_node_key,comment,created_at').eq('workflow_instance_id', request.workflow_instance_id).order('created_at', { ascending: true })
        actions = (data || []) as WorkflowAction[]
      } catch {}

      try {
        const { data } = await supabase
          .from('email_logs')
          .select('id,to_email,recipient_email,subject,template_key,notification_type,status,error_message,sent_at,failed_at,created_at')
          .or(`workflow_instance_id.eq.${request.workflow_instance_id},reference_id.eq.${request.id}`)
          .order('created_at', { ascending: false })
        emails = (data || []) as EmailLog[]
      } catch {}
    }
  }

  if (errorMessage) {
    return <><div style={{ marginBottom: 16 }}><Link href="/users/membership-requests" style={{ color: '#64748b', fontSize: 13 }}>← Back to Membership Requests</Link></div><div className="page-header"><h1>Membership Request</h1><p>Failed to load request detail.</p></div><div className="placeholder-card"><p style={{ color: '#dc2626', margin: 0 }}>{errorMessage}</p></div></>
  }

  if (!request) {
    return <><div style={{ marginBottom: 16 }}><Link href="/users/membership-requests" style={{ color: '#64748b', fontSize: 13 }}>← Back to Membership Requests</Link></div><div className="page-header"><h1>Request Not Found</h1><p>No membership request found for this id.</p></div><div className="placeholder-card"><p style={{ color: '#94a3b8', margin: 0, fontFamily: 'monospace' }}>{id}</p></div></>
  }

  const email = profile?.email || role?.email

  return (
    <>
      <div style={{ marginBottom: 16 }}><Link href="/users/membership-requests" style={{ color: '#64748b', fontSize: 13 }}>← Back to Membership Requests</Link></div>
      <div className="page-header"><h1>Membership Request</h1><p>Read-only request, workflow, task, action, and email history.</p></div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Request Info</h2>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', fontSize: 13 }}>
          <div><strong>Applicant:</strong> <Link href={`/users/${encodeURIComponent(`id:${request.user_id}`)}`} style={{ color: '#3b82f6' }}>{email || request.user_id}</Link></div>
          <div><strong>Name:</strong> {profile?.display_name || '-'}</div>
          <div><strong>User ID:</strong> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{request.user_id}</span></div>
          <div><strong>Level:</strong> {request.current_level} → {request.requested_level}</div>
          <div><strong>Status:</strong> {request.status}</div>
          <div><strong>Role:</strong> {role?.role || '-'}</div>
          <div><strong>VIP Until:</strong> {formatTokyoDateTime(role?.vip_until)}</div>
          <div><strong>Reviewed By:</strong> {request.reviewed_by || '-'}</div>
          <div><strong>Reviewed At:</strong> {formatTokyoDateTime(request.reviewed_at)}</div>
          <div><strong>Created:</strong> {formatTokyoDateTime(request.created_at)}</div>
          <div><strong>Updated:</strong> {formatTokyoDateTime(request.updated_at)}</div>
        </div>
        <div style={{ marginTop: 12, fontSize: 13 }}><strong>Reason:</strong><p style={{ whiteSpace: 'pre-wrap' }}>{request.reason || '-'}</p></div>
        <div style={{ fontSize: 13 }}><strong>Review Note:</strong><p style={{ whiteSpace: 'pre-wrap' }}>{request.review_note || '-'}</p></div>
        <div style={{ fontSize: 13 }}><strong>Reject Reason:</strong><p style={{ whiteSpace: 'pre-wrap' }}>{request.reject_reason || '-'}</p></div>
      </div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Workflow</h2>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', fontSize: 13 }}>
          <div><strong>Instance ID:</strong> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{request.workflow_instance_id || '-'}</span></div>
          <div><strong>Version ID:</strong> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{request.workflow_version_id || workflow?.workflow_version_id || '-'}</span></div>
          <div><strong>Status:</strong> {workflow?.status || '-'}</div>
          <div><strong>Current Node:</strong> {workflow?.current_node_key || '-'}</div>
          <div><strong>Reference:</strong> {workflow ? `${workflow.reference_type}:${workflow.reference_id}` : '-'}</div>
          <div><strong>Created:</strong> {formatTokyoDateTime(workflow?.created_at)}</div>
          <div><strong>Updated:</strong> {formatTokyoDateTime(workflow?.updated_at)}</div>
        </div>
      </div>

      <Section title="Workflow Tasks">
        {tasks.length === 0 ? <Empty text="No workflow tasks." /> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse', fontSize: 12 }}><tbody>{tasks.map((t) => <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: 10, fontWeight: 700 }}>{t.node_name}</td><td style={{ padding: 10 }}>{t.node_key}</td><td style={{ padding: 10 }}>{t.status}</td><td style={{ padding: 10 }}>{t.assignee_type || '-'}:{t.assignee_value || '-'}</td><td style={{ padding: 10, fontFamily: 'monospace' }}>{formatTokyoDateTime(t.created_at)}</td><td style={{ padding: 10, fontFamily: 'monospace' }}>{formatTokyoDateTime(t.completed_at)}</td></tr>)}</tbody></table></div>}
      </Section>

      <Section title="Workflow Actions">
        {actions.length === 0 ? <Empty text="No workflow actions." /> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse', fontSize: 12 }}><tbody>{actions.map((a) => <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: 10, fontWeight: 700 }}>{a.action}</td><td style={{ padding: 10 }}>{a.from_node_key || '-'} → {a.to_node_key || '-'}</td><td style={{ padding: 10, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.comment || '-'}</td><td style={{ padding: 10, fontFamily: 'monospace' }}>{a.actor_user_id || '-'}</td><td style={{ padding: 10, fontFamily: 'monospace' }}>{formatTokyoDateTime(a.created_at)}</td></tr>)}</tbody></table></div>}
      </Section>

      <Section title="Email Logs">
        {emails.length === 0 ? <Empty text="No email logs." /> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', fontSize: 12 }}><tbody>{emails.map((e) => <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: 10, fontWeight: 700 }}>{e.status}</td><td style={{ padding: 10 }}>{e.template_key || e.notification_type || '-'}</td><td style={{ padding: 10 }}>{e.recipient_email || e.to_email}</td><td style={{ padding: 10, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject}</td><td style={{ padding: 10, color: '#991b1b' }}>{e.error_message || '-'}</td><td style={{ padding: 10, fontFamily: 'monospace' }}>{formatTokyoDateTime(e.sent_at || e.failed_at || e.created_at)}</td></tr>)}</tbody></table></div>}
      </Section>
    </>
  )
}
