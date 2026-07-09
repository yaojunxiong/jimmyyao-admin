import Link from 'next/link'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'

export const dynamic = 'force-dynamic'

type VisitorEvent = {
  id: string
  user_id: string | null
  email: string | null
  user_email: string | null
  path: string | null
  page_type: string | null
  lesson_no: number | null
  referrer: string | null
  user_agent: string | null
  created_at: string
  ip: string | null
  is_admin: boolean
  workflow_skip_reason: string | null
  workflow_instance_id: string | null
}

type WorkflowInstance = {
  id: string
  reference_type: string
  reference_id: string
  status: string
  current_node_key: string | null
  created_at: string
  updated_at: string
}

type Profile = { id: string; email: string | null; display_name: string | null }

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div><strong>{label}:</strong> {value || '-'}</div>
}

export default async function VisitorEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  let event: VisitorEvent | null = null
  let workflow: WorkflowInstance | null = null
  let reverseWorkflow: WorkflowInstance | null = null
  let profile: Profile | null = null
  let errorMessage: string | null = null

  try {
    const { data, error } = await supabase
      .from('visitor_activity_events')
      .select('id,user_id,email,user_email,path,page_type,lesson_no,referrer,user_agent,created_at,ip,is_admin,workflow_skip_reason,workflow_instance_id')
      .eq('id', id)
      .maybeSingle()
    if (error) errorMessage = error.message
    else event = data as VisitorEvent | null
  } catch (e) {
    errorMessage = String(e)
  }

  if (event) {
    if (event.user_id) {
      try {
        const { data } = await supabase.from('profiles').select('id,email,display_name').eq('id', event.user_id).maybeSingle()
        profile = data as Profile | null
      } catch {}
    }

    if (event.workflow_instance_id) {
      try {
        const { data } = await supabase.from('workflow_instances').select('id,reference_type,reference_id,status,current_node_key,created_at,updated_at').eq('id', event.workflow_instance_id).maybeSingle()
        workflow = data as WorkflowInstance | null
      } catch {}
    }

    try {
      const { data } = await supabase.from('workflow_instances').select('id,reference_type,reference_id,status,current_node_key,created_at,updated_at').eq('reference_id', event.id).maybeSingle()
      reverseWorkflow = data as WorkflowInstance | null
    } catch {}
  }

  if (errorMessage) {
    return <><div style={{ marginBottom: 16 }}><Link href="/visitors" style={{ color: '#64748b', fontSize: 13 }}>← Back to Visitors</Link></div><div className="page-header"><h1>Visitor Event</h1><p>Failed to load visitor event.</p></div><div className="placeholder-card"><p style={{ color: '#dc2626', margin: 0 }}>{errorMessage}</p></div></>
  }

  if (!event) {
    return <><div style={{ marginBottom: 16 }}><Link href="/visitors" style={{ color: '#64748b', fontSize: 13 }}>← Back to Visitors</Link></div><div className="page-header"><h1>Visitor Event Not Found</h1><p>No visitor event found for this id.</p></div><div className="placeholder-card"><p style={{ color: '#94a3b8', margin: 0, fontFamily: 'monospace' }}>{id}</p></div></>
  }

  const email = event.email || event.user_email || profile?.email || null
  const relatedWorkflow = workflow || reverseWorkflow

  return (
    <>
      <div style={{ marginBottom: 16 }}><Link href="/visitors" style={{ color: '#64748b', fontSize: 13 }}>← Back to Visitors</Link></div>
      <div className="page-header"><h1>Visitor Event</h1><p>Read-only visitor activity context.</p></div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Visitor Event Summary</h2>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', fontSize: 13 }}>
          <Field label="ID" value={<span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{event.id}</span>} />
          <Field label="User ID" value={event.user_id ? <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{event.user_id}</span> : '-'} />
          <Field label="Email" value={email || '-'} />
          <Field label="Path" value={<code>{event.path}</code>} />
          <Field label="Page Type" value={event.page_type || '-'} />
          <Field label="Lesson No" value={event.lesson_no ?? '-'} />
          <Field label="Referrer" value={event.referrer || '-'} />
          <Field label="IP" value={event.ip || '-'} />
          <Field label="User Agent" value={event.user_agent || '-'} />
          <Field label="Visitor Type" value={event.is_admin ? 'Admin' : event.user_id || email ? 'Signed-in' : 'Anonymous'} />
          <Field label="Workflow Reason" value={event.workflow_skip_reason || '-'} />
          <Field label="Created" value={formatTokyoDateTime(event.created_at)} />
          <Field label="Updated" value="-" />
        </div>
      </div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Related User</h2>
        {event.user_id ? (
          <p style={{ margin: 0, fontSize: 13 }}><Link href={`/users/${encodeURIComponent(`id:${event.user_id}`)}`} style={{ color: '#3b82f6', fontWeight: 700 }}>{email || event.user_id}</Link>{profile?.display_name ? ` (${profile.display_name})` : ''}</p>
        ) : email ? (
          <p style={{ margin: 0, fontSize: 13 }}>{email}</p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>No related user.</p>
        )}
      </div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Related Workflow</h2>
        {relatedWorkflow ? (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', fontSize: 13 }}>
            <Field label="Workflow" value={<Link href={`/workflows/${relatedWorkflow.id}`} style={{ color: '#3b82f6', fontWeight: 700 }}>{relatedWorkflow.id}</Link>} />
            <Field label="Reference" value={`${relatedWorkflow.reference_type}:${relatedWorkflow.reference_id}`} />
            <Field label="Status" value={relatedWorkflow.status} />
            <Field label="Current Node" value={relatedWorkflow.current_node_key || '-'} />
            <Field label="Created" value={formatTokyoDateTime(relatedWorkflow.created_at)} />
            <Field label="Updated" value={formatTokyoDateTime(relatedWorkflow.updated_at)} />
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>No related workflow.</p>
        )}
      </div>

      <div className="placeholder-card">
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Raw / Metadata</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>No metadata column exists on visitor_activity_events.</p>
      </div>
    </>
  )
}
