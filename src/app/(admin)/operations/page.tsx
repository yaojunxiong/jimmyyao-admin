import Link from 'next/link'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'

export const dynamic = 'force-dynamic'

type QueryState<T> = { data: T[]; error: string | null }

type WorkflowInstance = {
  id: string
  reference_type: string
  reference_id: string
  current_node_key: string | null
  status: string
  created_at: string | null
}

type ForumPost = {
  id: string
  title: string | null
  author_email: string | null
  category: string | null
  created_at: string | null
}

type MembershipRequest = {
  id: string
  user_id: string
  current_level: string
  requested_level: string
  reason: string | null
  workflow_instance_id: string | null
  created_at: string | null
}

type EmailLog = {
  id: string
  workflow_instance_id: string | null
  to_email: string | null
  recipient_email: string | null
  template_key: string | null
  notification_type: string | null
  subject: string | null
  error_message: string | null
  failed_at: string | null
  created_at: string | null
}

type ForumAdminAction = {
  id: string
  post_id: string
  action: string
  actor_email: string | null
  created_at: string | null
}

type ForumCommentAdminAction = {
  id: string
  post_id: string
  comment_id: string
  action: string
  actor_email: string | null
  created_at: string | null
}

type AdminActionItem = {
  id: string
  kind: 'post' | 'comment'
  postId: string
  commentId: string | null
  action: string
  actorEmail: string | null
  createdAt: string | null
}

function shortId(value: string | null | undefined) {
  const text = String(value || '').trim()
  if (!text) return '-'
  return text.length <= 8 ? text : text.slice(0, 8)
}

function shortText(value: string | null | undefined, maxLength = 92) {
  const text = String(value || '').trim()
  if (!text) return '-'
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`
}

function statusBadge(value: string) {
  return <span style={{ display: 'inline-flex', borderRadius: 999, padding: '2px 8px', background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 800 }}>{value}</span>
}

function QueueSection({ title, count, href, error, empty, children }: { title: string; count: number; href: string; error: string | null; empty: string; children: ReactNode }) {
  return (
    <div className="placeholder-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 16px 0' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>{error ? 'Query failed' : `${count} item${count === 1 ? '' : 's'}`}</p>
        </div>
        <Link href={href} style={{ color: '#3b82f6', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>View all</Link>
      </div>
      {error ? <p style={{ margin: 0, padding: 16, color: '#dc2626', fontSize: 13, overflowWrap: 'anywhere' }}>{error}</p> : count === 0 ? <p style={{ margin: 0, padding: 16, color: '#94a3b8', fontSize: 13 }}>{empty}</p> : <div style={{ display: 'grid', gap: 0, paddingTop: 8 }}>{children}</div>}
    </div>
  )
}

function QueueItem({ href, title, meta, details, time }: { href?: string; title: ReactNode; meta: ReactNode; details?: ReactNode; time: string | null }) {
  const content = (
    <div style={{ display: 'grid', gap: 6, padding: '12px 16px', borderTop: '1px solid #f1f5f9', color: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
        <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 800 }}>{title}</div>
        <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{formatTokyoDateTime(time)}</div>
      </div>
      <div style={{ color: '#64748b', fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>
      {details ? <div style={{ color: '#475569', fontSize: 12, overflowWrap: 'anywhere' }}>{details}</div> : null}
    </div>
  )

  return href ? <Link href={href} style={{ color: 'inherit', textDecoration: 'none' }}>{content}</Link> : content
}

export default async function OperationsPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const workflows: QueryState<WorkflowInstance> = { data: [], error: null }
  const forumPosts: QueryState<ForumPost> = { data: [], error: null }
  const membershipRequests: QueryState<MembershipRequest> = { data: [], error: null }
  const failedEmails: QueryState<EmailLog> = { data: [], error: null }
  const adminActions: QueryState<AdminActionItem> = { data: [], error: null }

  try {
    const { data, error } = await supabase
      .from('workflow_instances')
      .select('id,reference_type,reference_id,current_node_key,status,created_at')
      .in('status', ['pending', 'in_progress', 'running'])
      .order('created_at', { ascending: true })
      .limit(25)
    if (error) workflows.error = error.message
    else workflows.data = (data || []) as WorkflowInstance[]
  } catch (e) {
    workflows.error = String(e)
  }

  try {
    const { data, error } = await supabase
      .from('forum_posts')
      .select('id,title,author_email,category,created_at')
      .eq('status', 'pending')
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(25)
    if (error) forumPosts.error = error.message
    else forumPosts.data = (data || []) as ForumPost[]
  } catch (e) {
    forumPosts.error = String(e)
  }

  try {
    const { data, error } = await supabase
      .from('membership_requests')
      .select('id,user_id,current_level,requested_level,reason,workflow_instance_id,created_at')
      .in('status', ['pending', 'submitted', 'in_review'])
      .order('created_at', { ascending: true })
      .limit(25)
    if (error) membershipRequests.error = error.message
    else membershipRequests.data = (data || []) as MembershipRequest[]
  } catch (e) {
    membershipRequests.error = String(e)
  }

  try {
    const { data, error } = await supabase
      .from('email_logs')
      .select('id,workflow_instance_id,to_email,recipient_email,template_key,notification_type,subject,error_message,failed_at,created_at')
      .in('status', ['failed', 'error'])
      .order('created_at', { ascending: false })
      .limit(25)
    if (error) failedEmails.error = error.message
    else failedEmails.data = (data || []) as EmailLog[]
  } catch (e) {
    failedEmails.error = String(e)
  }

  try {
    const [postActionsResult, commentActionsResult] = await Promise.all([
      supabase.from('forum_admin_actions').select('id,post_id,action,actor_email,created_at').order('created_at', { ascending: false }).limit(10),
      supabase.from('forum_comment_admin_actions').select('id,post_id,comment_id,action,actor_email,created_at').order('created_at', { ascending: false }).limit(10),
    ])
    if (postActionsResult.error) throw postActionsResult.error
    if (commentActionsResult.error) throw commentActionsResult.error

    const postActions = ((postActionsResult.data || []) as ForumAdminAction[]).map((item) => ({
      id: item.id,
      kind: 'post' as const,
      postId: item.post_id,
      commentId: null,
      action: item.action,
      actorEmail: item.actor_email,
      createdAt: item.created_at,
    }))
    const commentActions = ((commentActionsResult.data || []) as ForumCommentAdminAction[]).map((item) => ({
      id: item.id,
      kind: 'comment' as const,
      postId: item.post_id,
      commentId: item.comment_id,
      action: item.action,
      actorEmail: item.actor_email,
      createdAt: item.created_at,
    }))

    adminActions.data = [...postActions, ...commentActions]
      .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
      .slice(0, 10)
  } catch (e) {
    adminActions.error = String(e instanceof Error ? e.message : e)
  }

  const totalOpenItems = workflows.data.length + forumPosts.data.length + membershipRequests.data.length + failedEmails.data.length

  return (
    <>
      <div className="page-header">
        <h1>Operations Queue</h1>
        <p>Read-only queue of admin items that may need attention.</p>
      </div>

      <div className="placeholder-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card"><div className="stat-card-label">Open Queue Items</div><div className="stat-card-value">{totalOpenItems}</div></div>
        <div className="stat-card"><div className="stat-card-label">Pending Workflows</div><div className="stat-card-value">{workflows.error ? '-' : workflows.data.length}</div></div>
        <div className="stat-card"><div className="stat-card-label">Pending Forum Posts</div><div className="stat-card-value">{forumPosts.error ? '-' : forumPosts.data.length}</div></div>
        <div className="stat-card"><div className="stat-card-label">Failed Emails</div><div className="stat-card-value">{failedEmails.error ? '-' : failedEmails.data.length}</div></div>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 390px), 1fr))' }}>
        <QueueSection title="Pending Workflows" count={workflows.data.length} href="/workflows" error={workflows.error} empty="No pending workflows.">
          {workflows.data.map((workflow) => (
            <QueueItem key={workflow.id} href={`/workflows/${workflow.id}`} title={<>{statusBadge(workflow.status)} <span style={{ fontFamily: 'monospace' }}>{shortId(workflow.id)}</span></>} meta={`${workflow.reference_type}:${workflow.reference_id}`} details={`Current node: ${workflow.current_node_key || '-'}`} time={workflow.created_at} />
          ))}
        </QueueSection>

        <QueueSection title="Pending Forum Posts" count={forumPosts.data.length} href="/forum?status=pending" error={forumPosts.error} empty="No pending forum posts.">
          {forumPosts.data.map((post) => (
            <QueueItem key={post.id} href={`/forum/posts/${post.id}`} title={shortText(post.title, 70)} meta={`${post.author_email || '-'} | ${post.category || '-'}`} time={post.created_at} />
          ))}
        </QueueSection>

        <QueueSection title="Pending Membership Requests" count={membershipRequests.data.length} href="/users/membership-requests" error={membershipRequests.error} empty="No pending membership requests.">
          {membershipRequests.data.map((request) => (
            <QueueItem key={request.id} href={`/users/membership-requests/${request.id}`} title={`${request.current_level} -> ${request.requested_level}`} meta={`${request.user_id} | workflow: ${request.workflow_instance_id ? shortId(request.workflow_instance_id) : '-'}`} details={shortText(request.reason, 120)} time={request.created_at} />
          ))}
        </QueueSection>

        <QueueSection title="Recent Errors / Failed Emails" count={failedEmails.data.length} href="/logs?tab=email" error={failedEmails.error} empty="No recent failed email logs.">
          {failedEmails.data.map((email) => (
            <QueueItem key={email.id} href={`/logs/email/${email.id}`} title={email.recipient_email || email.to_email || '-'} meta={`${email.template_key || email.notification_type || '-'} | ${shortText(email.subject, 64)}`} details={email.workflow_instance_id ? <>Workflow: <span style={{ fontFamily: 'monospace' }}>{shortId(email.workflow_instance_id)}</span> | {shortText(email.error_message, 120)}</> : shortText(email.error_message, 140)} time={email.failed_at || email.created_at} />
          ))}
        </QueueSection>

        <QueueSection title="Recent Admin Actions" count={adminActions.data.length} href="/forum" error={adminActions.error} empty="No recent admin actions.">
          {adminActions.data.map((action) => (
            <QueueItem key={`${action.kind}-${action.id}`} href={`/forum/posts/${action.postId}`} title={`${action.kind} ${action.action}`} meta={`${action.actorEmail || '-'} | post: ${shortId(action.postId)}`} details={action.commentId ? `Comment: ${shortId(action.commentId)}` : 'Post action'} time={action.createdAt} />
          ))}
        </QueueSection>
      </div>
    </>
  )
}
