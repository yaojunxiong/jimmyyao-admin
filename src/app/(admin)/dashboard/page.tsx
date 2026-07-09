import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  let todayVisits: number | null = null
  let pendingWorkflows = 0
  let pendingForumPosts = 0
  const todayLogins = 0

  try {
    const supabase = createClient(cookieStore)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { count: vCount } = await supabase
      .from('visitor_activity_events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString())
    if (vCount !== null) todayVisits = vCount
  } catch {}

  try {
    const supabase = createClient(cookieStore)
    const { count: total } = await supabase
      .from('workflow_instances')
      .select('*', { count: 'exact', head: true })
      .in('status', ['running', 'pending'])
    if (total !== null) pendingWorkflows = total
  } catch {}

  try {
    const supabase = createClient(cookieStore)
    const { count: count } = await supabase
      .from('forum_posts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    if (count !== null) pendingForumPosts = count
  } catch {}

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>System overview and key metrics</p>
      </div>

      <div className="placeholder-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-label">Today Visits</div>
          <div className="stat-card-value">{todayVisits !== null ? todayVisits : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Today Logins</div>
          <div className="stat-card-value">{todayLogins || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Pending Workflows</div>
          <div className="stat-card-value">{pendingWorkflows}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Forum Pending Review</div>
          <div className="stat-card-value">{pendingForumPosts}</div>
        </div>
      </div>

      <div className="placeholder-card">
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>System Overview</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
          Welcome to the jimmyyao.com unified admin center.
          This dashboard provides a centralized view of all subsystems.
          Detailed analytics and management tools are available via the sidebar navigation.
        </p>
      </div>
    </>
  )
}
