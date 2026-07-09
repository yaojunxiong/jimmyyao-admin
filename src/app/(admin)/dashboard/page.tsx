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
  created_at: string
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

type MembershipRequest = {
  id: string
  user_id: string
  current_level: string
  requested_level: string
  status: string
  created_at: string
}

type ForumPost = {
  id: string
  author_email: string | null
  title: string | null
  category: string | null
  status: string | null
  created_at: string | null
}

type QueryState<T> = {
  data: T
  error: string | null
}

function tokyoTodayStartIso() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0)).toISOString()
}

function shortId(value: string | null | undefined) {
  const text = String(value || '').trim()
  return text.length <= 8 ? text || '-' : text.slice(0, 8)
}

function shortText(value: string | null | undefined, maxLength = 56) {
  const text = String(value || '').trim()
  if (!text) return '-'
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`
}

function MetricCard({ label, value, href, error }: { label: string; value: ReactNode; href?: string; error?: string | null }) {
  const content = (
    <div className="stat-card" style={{ minHeight: 112 }}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{error ? '—' : value}</div>
      {error ? <div style={{ marginTop: 8, color: '#dc2626', fontSize: 12 }}>{error}</div> : null}
    </div>
  )
  return href ? <Link href={href} style={{ color: 'inherit', textDecoration: 'none' }}>{content}</Link> : content
}

function Section({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <div className="placeholder-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 16px 0' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h2>
        <Link href={href} style={{ color: '#3b82f6', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>View all</Link>
      </div>
      {children}
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return <p style={{ margin: 0, padding: 16, color: '#dc2626', fontSize: 13 }}>{message}</p>
}

function EmptyState({ message }: { message: string }) {
  return <p style={{ margin: 0, padding: 16, color: '#94a3b8', fontSize: 13 }}>{message}</p>
}

function ActivityList({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gap: 0, paddingTop: 8 }}>{children}</div>
}

function ActivityItem({ href, title, meta, time }: { href: string; title: ReactNode; meta: ReactNode; time: string | null }) {
  return (
    <Link href={href} style={{ display: 'grid', gap: 4, padding: '12px 16px', borderTop: '1px solid #f1f5f9', color: 'inherit', textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{formatTokyoDateTime(time)}</div>
      </div>
      <div style={{ color: '#64748b', fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>
    </Link>
  )
}

const quickLinks = [
  { href: '/visitors', label: 'Visitors', description: 'Visitor events and traffic' },
  { href: '/workflows', label: 'Workflows', description: 'Workflow instances' },
  { href: '/logs', label: 'Logs', description: 'Email and system logs' },
  { href: '/forum', label: 'Forum Posts', description: 'Forum post moderation' },
  { href: '/forum/comments', label: 'Forum Comments', description: 'Comment moderation' },
  { href: '/users', label: 'Users', description: 'Unified user view' },
  { href: '/users/membership-requests', label: 'Membership Requests', description: 'VIP requests' },
  { href: '/system', label: 'System Settings', description: 'Admin system settings' },
]

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const todayStart = tokyoTodayStartIso()
  const nowIso = new Date().toISOString()

  const todayVisitors: QueryState<VisitorEvent[]> = { data: [], error: null }
  const recentVisitors: QueryState<VisitorEvent[]> = { data: [], error: null }
  const recentWorkflows: QueryState<WorkflowInstance[]> = { data: [], error: null }
  const recentMemberships: QueryState<MembershipRequest[]> = { data: [], error: null }
  const recentForumPosts: QueryState<ForumPost[]> = { data: [], error: null }

  let todayVisitCount: number | null = null
  let pendingWorkflowCount: number | null = null
  let pendingForumPostCount: number | null = null
  let activeVipCount: number | null = null
  let todayMembershipRequestCount: number | null = null
  let todayVisitCountError: string | null = null
  let activeUserCountError: string | null = null
  let pendingWorkflowCountError: string | null = null
  let pendingForumPostCountError: string | null = null
  let activeVipCountError: string | null = null
  let todayMembershipRequestCountError: string | null = null

  try {
    const { count, error } = await supabase.from('visitor_activity_events').select('*', { count: 'exact', head: true }).gte('created_at', todayStart)
    if (error) todayVisitCountError = error.message
    else todayVisitCount = count || 0
  } catch (e) {
    todayVisitCountError = String(e)
  }

  try {
    const { data, error } = await supabase.from('visitor_activity_events').select('id,user_id,email,user_email,path,page_type,created_at').gte('created_at', todayStart).order('created_at', { ascending: false }).limit(5000)
    if (error) {
      todayVisitors.error = error.message
      activeUserCountError = error.message
    } else {
      todayVisitors.data = (data || []) as VisitorEvent[]
    }
  } catch (e) {
    todayVisitors.error = String(e)
    activeUserCountError = String(e)
  }

  try {
    const { count, error } = await supabase.from('workflow_instances').select('*', { count: 'exact', head: true }).in('status', ['pending', 'in_progress', 'running'])
    if (error) pendingWorkflowCountError = error.message
    else pendingWorkflowCount = count || 0
  } catch (e) {
    pendingWorkflowCountError = String(e)
  }

  try {
    const { count, error } = await supabase.from('forum_posts').select('*', { count: 'exact', head: true }).eq('status', 'pending')
    if (error) pendingForumPostCountError = error.message
    else pendingForumPostCount = count || 0
  } catch (e) {
    pendingForumPostCountError = String(e)
  }

  try {
    const { count, error } = await supabase.from('user_roles').select('*', { count: 'exact', head: true }).gte('vip_until', nowIso)
    if (error) activeVipCountError = error.message
    else activeVipCount = count || 0
  } catch (e) {
    activeVipCountError = String(e)
  }

  try {
    const { count, error } = await supabase.from('membership_requests').select('*', { count: 'exact', head: true }).gte('created_at', todayStart)
    if (error) todayMembershipRequestCountError = error.message
    else todayMembershipRequestCount = count || 0
  } catch (e) {
    todayMembershipRequestCountError = String(e)
  }

  try {
    const { data, error } = await supabase.from('visitor_activity_events').select('id,user_id,email,user_email,path,page_type,created_at').order('created_at', { ascending: false }).limit(10)
    if (error) recentVisitors.error = error.message
    else recentVisitors.data = (data || []) as VisitorEvent[]
  } catch (e) {
    recentVisitors.error = String(e)
  }

  try {
    const { data, error } = await supabase.from('workflow_instances').select('id,reference_type,reference_id,status,current_node_key,created_at,updated_at').order('created_at', { ascending: false }).limit(10)
    if (error) recentWorkflows.error = error.message
    else recentWorkflows.data = (data || []) as WorkflowInstance[]
  } catch (e) {
    recentWorkflows.error = String(e)
  }

  try {
    const { data, error } = await supabase.from('membership_requests').select('id,user_id,current_level,requested_level,status,created_at').order('created_at', { ascending: false }).limit(10)
    if (error) recentMemberships.error = error.message
    else recentMemberships.data = (data || []) as MembershipRequest[]
  } catch (e) {
    recentMemberships.error = String(e)
  }

  try {
    const { data, error } = await supabase.from('forum_posts').select('id,author_email,title,category,status,created_at').order('created_at', { ascending: false }).limit(10)
    if (error) recentForumPosts.error = error.message
    else recentForumPosts.data = (data || []) as ForumPost[]
  } catch (e) {
    recentForumPosts.error = String(e)
  }

  const activeUsers = new Set(
    todayVisitors.data
      .map((event) => event.user_id || event.email || event.user_email)
      .filter((identity): identity is string => !!identity)
  )

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Read-only overview of admin activity and system queues.</p>
      </div>

      <div className="placeholder-grid" style={{ marginBottom: 24 }}>
        <MetricCard label="Today Visit Events" value={todayVisitCount ?? 0} href="/visitors?range=24h" error={todayVisitCountError} />
        <MetricCard label="Today Active Users" value={activeUsers.size} href="/visitors?range=24h&user=signed-in" error={activeUserCountError} />
        <MetricCard label="Pending Workflows" value={pendingWorkflowCount ?? 0} href="/workflows" error={pendingWorkflowCountError} />
        <MetricCard label="Forum Pending Review" value={pendingForumPostCount ?? 0} href="/forum?status=pending" error={pendingForumPostCountError} />
        <MetricCard label="Active VIP" value={activeVipCount ?? 0} href="/users?role=normal" error={activeVipCountError} />
        <MetricCard label="Today Membership Requests" value={todayMembershipRequestCount ?? 0} href="/users/membership-requests?range=24h" error={todayMembershipRequestCountError} />
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 390px), 1fr))', marginBottom: 24 }}>
        <Section title="Recent Visitor Events" href="/visitors">
          {recentVisitors.error ? <ErrorState message={recentVisitors.error} /> : recentVisitors.data.length === 0 ? <EmptyState message="No visitor events found." /> : (
            <ActivityList>
              {recentVisitors.data.map((event) => (
                <ActivityItem key={event.id} href={`/visitors/events/${event.id}`} title={event.email || event.user_email || event.user_id || 'Anonymous visitor'} meta={`${event.page_type || 'page'} | ${shortText(event.path, 80)}`} time={event.created_at} />
              ))}
            </ActivityList>
          )}
        </Section>

        <Section title="Recent Workflows" href="/workflows">
          {recentWorkflows.error ? <ErrorState message={recentWorkflows.error} /> : recentWorkflows.data.length === 0 ? <EmptyState message="No workflow instances found." /> : (
            <ActivityList>
              {recentWorkflows.data.map((workflow) => (
                <ActivityItem key={workflow.id} href={`/workflows/${workflow.id}`} title={`${workflow.status} | ${shortId(workflow.id)}`} meta={`${workflow.reference_type}:${workflow.reference_id} | ${workflow.current_node_key || '-'}`} time={workflow.created_at} />
              ))}
            </ActivityList>
          )}
        </Section>

        <Section title="Recent Membership Requests" href="/users/membership-requests">
          {recentMemberships.error ? <ErrorState message={recentMemberships.error} /> : recentMemberships.data.length === 0 ? <EmptyState message="No membership requests found." /> : (
            <ActivityList>
              {recentMemberships.data.map((request) => (
                <ActivityItem key={request.id} href={`/users/membership-requests/${request.id}`} title={`${request.current_level} -> ${request.requested_level}`} meta={`${request.status} | ${request.user_id}`} time={request.created_at} />
              ))}
            </ActivityList>
          )}
        </Section>

        <Section title="Recent Forum Posts" href="/forum">
          {recentForumPosts.error ? <ErrorState message={recentForumPosts.error} /> : recentForumPosts.data.length === 0 ? <EmptyState message="No forum posts found." /> : (
            <ActivityList>
              {recentForumPosts.data.map((post) => (
                <ActivityItem key={post.id} href={`/forum/posts/${post.id}`} title={post.title || 'Untitled post'} meta={`${post.status || 'pending'} | ${post.category || '-'} | ${post.author_email || '-'}`} time={post.created_at} />
              ))}
            </ActivityList>
          )}
        </Section>
      </div>

      <div className="placeholder-card">
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>Quick Links</h2>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, color: 'inherit', textDecoration: 'none' }}>
              <div style={{ color: '#0f172a', fontSize: 14, fontWeight: 800 }}>{link.label}</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{link.description}</div>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
