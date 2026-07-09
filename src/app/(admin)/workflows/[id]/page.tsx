import Link from 'next/link'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'

export const dynamic = 'force-dynamic'

type WorkflowInstance = { id: string; workflow_version_id: string; reference_type: string; reference_id: string; current_node_key: string | null; status: string; created_at: string; updated_at: string }
type WorkflowTask = { id: string; node_key: string; node_name: string; assignee_type: string | null; assignee_value: string | null; status: string; created_at: string; completed_at: string | null; completed_by: string | null }
type WorkflowAction = { id: string; actor_user_id: string | null; action: string; from_node_key: string | null; to_node_key: string | null; comment: string | null; created_at: string }
type EmailLog = { id: string; to_email: string; recipient_email: string | null; subject: string; template_key: string | null; notification_type: string | null; status: string; error_message: string | null; sent_at: string | null; failed_at: string | null; created_at: string }
type MembershipRequest = { id: string; user_id: string; current_level: string; requested_level: string; status: string; reason: string | null; created_at: string; updated_at: string }
type VisitorEvent = { id: string; email: string | null; user_email: string | null; path: string; page_type: string | null; created_at: string }

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="placeholder-card" style={{ overflowX: 'auto', padding: 0, marginBottom: 16 }}><h2 style={{ margin: 0, padding: '16px 16px 0', fontSize: 16, fontWeight: 700 }}>{title}</h2>{children}</div>
}

function Empty({ text }: { text: string }) {
  return <p style={{ padding: 16, fontSize: 13, color: '#94a3b8' }}>{text}</p>
}

export default async function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  let workflow: WorkflowInstance | null = null
  let tasks: WorkflowTask[] = []
  let actions: WorkflowAction[] = []
  let emails: EmailLog[] = []
  let membershipRequest: MembershipRequest | null = null
  let visitorEvent: VisitorEvent | null = null
  let errorMessage: string | null = null

  try {
    const { data, error } = await supabase.from('workflow_instances').select('id,workflow_version_id,reference_type,reference_id,current_node_key,status,created_at,updated_at').eq('id', id).maybeSingle()
    if (error) errorMessage = error.message
    else workflow = data as WorkflowInstance | null
  } catch (e) {
    errorMessage = String(e)
  }

  if (workflow) {
    try {
      const { data } = await supabase.from('workflow_tasks').select('id,node_key,node_name,assignee_type,assignee_value,status,created_at,completed_at,completed_by').eq('workflow_instance_id', workflow.id).order('created_at', { ascending: true })
      tasks = (data || []) as WorkflowTask[]
    } catch {}

    try {
      const { data } = await supabase.from('workflow_actions').select('id,actor_user_id,action,from_node_key,to_node_key,comment,created_at').eq('workflow_instance_id', workflow.id).order('created_at', { ascending: true })
      actions = (data || []) as WorkflowAction[]
    } catch {}

    try {
      const { data } = await supabase.from('email_logs').select('id,to_email,recipient_email,subject,template_key,notification_type,status,error_message,sent_at,failed_at,created_at').or(`workflow_instance_id.eq.${workflow.id},reference_id.eq.${workflow.reference_id}`).order('created_at', { ascending: false })
      emails = (data || []) as EmailLog[]
    } catch {}

    if (workflow.reference_type === 'membership_application') {
      try {
        const { data } = await supabase.from('membership_requests').select('id,user_id,current_level,requested_level,status,reason,created_at,updated_at').eq('id', workflow.reference_id).maybeSingle()
        membershipRequest = data as MembershipRequest | null
      } catch {}
    } else if (workflow.reference_type === 'study_visitor' || workflow.reference_type === 'logged_in_first_visit') {
      try {
        const { data } = await supabase.from('visitor_activity_events').select('id,email,user_email,path,page_type,created_at').eq('id', workflow.reference_id).maybeSingle()
        visitorEvent = data as VisitorEvent | null
      } catch {}
    }
  }

  if (errorMessage) {
    return <><div style={{ marginBottom: 16 }}><Link href="/workflows" style={{ color: '#64748b', fontSize: 13 }}>← Back to Workflows</Link></div><div className="page-header"><h1>Workflow Detail</h1><p>Failed to load workflow instance.</p></div><div className="placeholder-card"><p style={{ color: '#dc2626', margin: 0 }}>{errorMessage}</p></div></>
  }

  if (!workflow) {
    return <><div style={{ marginBottom: 16 }}><Link href="/workflows" style={{ color: '#64748b', fontSize: 13 }}>← Back to Workflows</Link></div><div className="page-header"><h1>Workflow Not Found</h1><p>No workflow instance found for this id.</p></div><div className="placeholder-card"><p style={{ color: '#94a3b8', margin: 0, fontFamily: 'monospace' }}>{id}</p></div></>
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}><Link href="/workflows" style={{ color: '#64748b', fontSize: 13 }}>← Back to Workflows</Link></div>
      <div className="page-header"><h1>Workflow Instance</h1><p>Read-only workflow instance detail with tasks, actions, and email logs.</p></div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Workflow Instance Summary</h2>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', fontSize: 13 }}>
          <div><strong>ID:</strong> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{workflow.id}</span></div>
          <div><strong>Version ID:</strong> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{workflow.workflow_version_id}</span></div>
          <div><strong>Status:</strong> {workflow.status}</div>
          <div><strong>Current Node:</strong> {workflow.current_node_key || '-'}</div>
          <div><strong>Reference Type:</strong> {workflow.reference_type}</div>
          <div><strong>Reference ID:</strong> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{workflow.reference_id}</span></div>
          <div><strong>Created:</strong> {formatTokyoDateTime(workflow.created_at)}</div>
          <div><strong>Updated:</strong> {formatTokyoDateTime(workflow.updated_at)}</div>
        </div>
      </div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Related Object</h2>
        {membershipRequest ? (
          <div style={{ fontSize: 13 }}>
            <Link href={`/users/membership-requests/${membershipRequest.id}`} style={{ color: '#3b82f6', fontWeight: 700 }}>Membership Request</Link>
            <div style={{ marginTop: 6 }}>{membershipRequest.current_level} → {membershipRequest.requested_level} | {membershipRequest.status}</div>
            <div style={{ marginTop: 4, color: '#64748b' }}>{membershipRequest.reason || '-'}</div>
          </div>
        ) : visitorEvent ? (
          <div style={{ fontSize: 13 }}>
            <div><strong>Visitor Event:</strong> <Link href={`/visitors/events/${visitorEvent.id}`} style={{ color: '#3b82f6', fontFamily: 'monospace', fontWeight: 700 }}>{visitorEvent.id}</Link></div>
            <div style={{ marginTop: 6 }}>{visitorEvent.email || visitorEvent.user_email || '-'} | {visitorEvent.path}</div>
            <div style={{ marginTop: 4, color: '#64748b' }}>{visitorEvent.page_type || '-'} | {formatTokyoDateTime(visitorEvent.created_at)}</div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{workflow.reference_type}:{workflow.reference_id}</p>
        )}
      </div>

      <Section title="Tasks">
        {tasks.length === 0 ? <Empty text="No workflow tasks." /> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse', fontSize: 12 }}><tbody>{tasks.map((t) => <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: 10, fontWeight: 700 }}>{t.node_name}</td><td style={{ padding: 10 }}>{t.node_key}</td><td style={{ padding: 10 }}>{t.status}</td><td style={{ padding: 10 }}>{t.assignee_type || '-'}:{t.assignee_value || '-'}</td><td style={{ padding: 10, fontFamily: 'monospace' }}>{formatTokyoDateTime(t.created_at)}</td><td style={{ padding: 10, fontFamily: 'monospace' }}>{formatTokyoDateTime(t.completed_at)}</td></tr>)}</tbody></table></div>}
      </Section>

      <Section title="Actions">
        {actions.length === 0 ? <Empty text="No workflow actions." /> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse', fontSize: 12 }}><tbody>{actions.map((a) => <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: 10, fontWeight: 700 }}>{a.action}</td><td style={{ padding: 10 }}>{a.from_node_key || '-'} → {a.to_node_key || '-'}</td><td style={{ padding: 10, fontFamily: 'monospace' }}>{a.actor_user_id || '-'}</td><td style={{ padding: 10, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.comment || '-'}</td><td style={{ padding: 10, fontFamily: 'monospace' }}>{formatTokyoDateTime(a.created_at)}</td></tr>)}</tbody></table></div>}
      </Section>

      <Section title="Email Logs">
        {emails.length === 0 ? <Empty text="No email logs." /> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', fontSize: 12 }}><tbody>{emails.map((e) => <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: 10, fontWeight: 700 }}><Link href={`/logs/email/${e.id}`} style={{ color: '#3b82f6' }}>{e.status}</Link></td><td style={{ padding: 10 }}>{e.template_key || e.notification_type || '-'}</td><td style={{ padding: 10 }}>{e.recipient_email || e.to_email}</td><td style={{ padding: 10, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject}</td><td style={{ padding: 10, color: '#991b1b' }}>{e.error_message || '-'}</td><td style={{ padding: 10, fontFamily: 'monospace' }}>{formatTokyoDateTime(e.sent_at || e.failed_at || e.created_at)}</td></tr>)}</tbody></table></div>}
      </Section>
    </>
  )
}
