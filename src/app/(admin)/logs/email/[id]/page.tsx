import Link from 'next/link'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'

export const dynamic = 'force-dynamic'

const EMAIL_LOG_SELECT = 'id,workflow_instance_id,reference_id,status,template_key,notification_type,recipient_email,to_email,subject,error_message,sent_at,failed_at,created_at'
const EMAIL_LOG_OPTIONAL_SELECT = 'updated_at,payload,metadata'

type EmailLog = {
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
  updated_at?: string | null
  payload?: unknown
  metadata?: unknown
}

type WorkflowInstance = {
  id: string
  reference_type: string
  reference_id: string
  status: string
  current_node_key: string | null
  created_at: string | null
  updated_at: string | null
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div><strong>{label}:</strong> {value || '-'}</div>
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="placeholder-card" style={{ marginBottom: 16 }}><h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>{title}</h2>{children}</div>
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || typeof value === 'undefined') return <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>No metadata</p>
  return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.5, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>{JSON.stringify(value, null, 2)}</pre>
}

export default async function EmailLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  let email: EmailLog | null = null
  let workflow: WorkflowInstance | null = null
  let errorMessage: string | null = null
  let optionalColumnsAvailable = false

  try {
    const { data, error } = await supabase.from('email_logs').select(EMAIL_LOG_SELECT).eq('id', id).maybeSingle()
    if (error) errorMessage = error.message
    else email = data as EmailLog | null
  } catch (e) {
    errorMessage = String(e)
  }

  if (email) {
    try {
      const { data, error } = await supabase.from('email_logs').select(EMAIL_LOG_OPTIONAL_SELECT).eq('id', id).maybeSingle()
      if (!error && data) {
        optionalColumnsAvailable = true
        email = { ...email, ...(data as Partial<EmailLog>) }
      }
    } catch {}

    if (email.workflow_instance_id) {
      try {
        const { data } = await supabase.from('workflow_instances').select('id,reference_type,reference_id,status,current_node_key,created_at,updated_at').eq('id', email.workflow_instance_id).maybeSingle()
        workflow = data as WorkflowInstance | null
      } catch {}
    }
  }

  if (errorMessage) {
    return <><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}><Link href="/logs" style={{ color: '#64748b', fontSize: 13 }}>← Back to Logs</Link><Link href="/operations" style={{ color: '#64748b', fontSize: 13 }}>← Back to Operations</Link></div><div className="page-header"><h1>Email Log</h1><p>Failed to load email log.</p></div><div className="placeholder-card"><p style={{ color: '#dc2626', margin: 0 }}>{errorMessage}</p></div></>
  }

  if (!email) {
    return <><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}><Link href="/logs" style={{ color: '#64748b', fontSize: 13 }}>← Back to Logs</Link><Link href="/operations" style={{ color: '#64748b', fontSize: 13 }}>← Back to Operations</Link></div><div className="page-header"><h1>Email Log Not Found</h1><p>No email log found for this id.</p></div><div className="placeholder-card"><p style={{ color: '#94a3b8', margin: 0, fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{id}</p></div></>
  }

  const recipient = email.recipient_email || email.to_email || '-'
  const metadata = typeof email.metadata !== 'undefined' ? email.metadata : email.payload

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Link href="/logs" style={{ color: '#64748b', fontSize: 13 }}>← Back to Logs</Link>
        <Link href="/operations" style={{ color: '#64748b', fontSize: 13 }}>← Back to Operations</Link>
      </div>
      <div className="page-header"><h1>Email Log</h1><p>Read-only email delivery and failure context.</p></div>

      <Section title="Email Log Summary">
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', fontSize: 13 }}>
          <Field label="ID" value={<span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{email.id}</span>} />
          <Field label="Status" value={email.status || '-'} />
          <Field label="Template Key" value={email.template_key || '-'} />
          <Field label="Notification Type" value={email.notification_type || '-'} />
          <Field label="Recipient" value={recipient} />
          <Field label="Subject" value={email.subject || '-'} />
          <Field label="Created" value={formatTokyoDateTime(email.created_at)} />
          <Field label="Sent" value={formatTokyoDateTime(email.sent_at)} />
          <Field label="Failed" value={formatTokyoDateTime(email.failed_at)} />
          <Field label="Updated" value={optionalColumnsAvailable ? formatTokyoDateTime(email.updated_at) : '-'} />
        </div>
      </Section>

      <Section title="Error Details">
        <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
          <Field label="Failure Status" value={email.status || '-'} />
          <div><strong>Error Message:</strong><pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.5, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 12 }}>{email.error_message || 'No error message'}</pre></div>
        </div>
      </Section>

      <Section title="Related Workflow">
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', fontSize: 13 }}>
          <Field label="Workflow Instance" value={email.workflow_instance_id ? <Link href={`/workflows/${email.workflow_instance_id}`} style={{ color: '#3b82f6', fontWeight: 700, fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{email.workflow_instance_id}</Link> : '-'} />
          <Field label="Reference ID" value={email.reference_id ? <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{email.reference_id}</span> : '-'} />
          <Field label="Workflow Status" value={workflow?.status || '-'} />
          <Field label="Current Node" value={workflow?.current_node_key || '-'} />
          <Field label="Workflow Reference" value={workflow ? `${workflow.reference_type}:${workflow.reference_id}` : '-'} />
          <Field label="Workflow Updated" value={formatTokyoDateTime(workflow?.updated_at)} />
        </div>
      </Section>

      <Section title="Raw / Metadata">
        <JsonBlock value={metadata} />
        {!optionalColumnsAvailable ? <p style={{ margin: '10px 0 0', color: '#94a3b8', fontSize: 12 }}>No optional metadata columns were available from email_logs.</p> : null}
      </Section>
    </>
  )
}
