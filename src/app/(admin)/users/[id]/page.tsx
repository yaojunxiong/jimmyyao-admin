import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'

export const dynamic = 'force-dynamic'

type Summary = {
  user_key: string
  user_id: string | null
  email: string | null
  display_name: string | null
  avatar_url: string | null
  role: string
  vip_until: string | null
  created_at: string | null
  last_activity_at: string | null
  visitor_event_count: number
  forum_post_count: number
  forum_comment_count: number
  lesson_progress_count: number
  attempt_count: number
  is_admin: boolean
}

type VisitorEvent = {
  id: string
  path: string
  page_type: string | null
  referrer: string | null
  ip: string | null
  user_agent: string | null
  created_at: string
}

type ForumPost = {
  id: string
  title: string
  status: string
  category: string
  created_at: string
}

type ForumComment = {
  id: string
  post_id: string
  body: string
  is_deleted: boolean
  created_at: string
}

type LessonProgress = {
  id: string
  user_key: string
  lesson_id: string
  created_at: string
  updated_at: string
}

type Attempt = {
  id: string
  lesson_no: number
  item_type: string
  item_id: string
  mode: string
  is_correct: boolean
  created_at: string
}

type DetailResult = {
  success: boolean
  error?: string
  summary?: Summary
  visitor_events?: VisitorEvent[]
  forum_posts?: ForumPost[]
  forum_comments?: ForumComment[]
  lesson_progress?: LessonProgress[]
  attempts?: Attempt[]
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="placeholder-card" style={{ overflowX: 'auto', padding: 0, marginBottom: 16 }}>
      <h2 style={{ margin: 0, padding: '16px 16px 0', fontSize: 16, fontWeight: 700 }}>{title}</h2>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p style={{ padding: 16, fontSize: 13, color: '#94a3b8' }}>{text}</p>
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const userKey = decodeURIComponent(id)
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  let detail: DetailResult | null = null
  let errorMessage: string | null = null

  try {
    const { data, error } = await supabase.rpc('admin_get_user_detail', { p_user_key: userKey })
    if (error) errorMessage = error.message
    else detail = data as DetailResult
  } catch (e) {
    errorMessage = String(e)
  }

  if (errorMessage) {
    return (
      <>
        <div style={{ marginBottom: 16 }}><Link href="/users" style={{ color: '#64748b', fontSize: 13 }}>← Back to Users</Link></div>
        <div className="page-header"><h1>User Detail</h1><p>Failed to load user detail.</p></div>
        <div className="placeholder-card"><p style={{ color: '#dc2626', margin: 0 }}>{errorMessage}</p></div>
      </>
    )
  }

  if (!detail?.success || !detail.summary) {
    return (
      <>
        <div style={{ marginBottom: 16 }}><Link href="/users" style={{ color: '#64748b', fontSize: 13 }}>← Back to Users</Link></div>
        <div className="page-header"><h1>User Not Found</h1><p>No user summary found for this key.</p></div>
        <div className="placeholder-card"><p style={{ color: '#94a3b8', margin: 0, fontFamily: 'monospace' }}>{userKey}</p></div>
      </>
    )
  }

  const summary = detail.summary
  const visitors = detail.visitor_events || []
  const posts = detail.forum_posts || []
  const comments = detail.forum_comments || []
  const progress = detail.lesson_progress || []
  const attempts = detail.attempts || []

  return (
    <>
      <div style={{ marginBottom: 16 }}><Link href="/users" style={{ color: '#64748b', fontSize: 13 }}>← Back to Users</Link></div>

      <div className="page-header">
        <h1>{summary.email || summary.display_name || summary.user_key}</h1>
        <p>Read-only user activity detail across visitors, forum, and study data.</p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-card-label">Visitors</div><div className="stat-card-value">{summary.visitor_event_count}</div></div>
        <div className="stat-card"><div className="stat-card-label">Forum Posts</div><div className="stat-card-value">{summary.forum_post_count}</div></div>
        <div className="stat-card"><div className="stat-card-label">Comments</div><div className="stat-card-value">{summary.forum_comment_count}</div></div>
        <div className="stat-card"><div className="stat-card-label">Study</div><div className="stat-card-value">{summary.lesson_progress_count + summary.attempt_count}</div></div>
      </div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Basic Info</h2>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', fontSize: 13 }}>
          <div><strong>Email:</strong> {summary.email || '-'}</div>
          <div><strong>Name:</strong> {summary.display_name || '-'}</div>
          <div><strong>Role:</strong> {summary.role}</div>
          <div><strong>VIP Until:</strong> {formatTokyoDateTime(summary.vip_until)}</div>
          <div><strong>Created:</strong> {formatTokyoDateTime(summary.created_at)}</div>
          <div><strong>Last Activity:</strong> {formatTokyoDateTime(summary.last_activity_at)}</div>
          <div style={{ wordBreak: 'break-all' }}><strong>User ID:</strong> {summary.user_id || '-'}</div>
          <div style={{ wordBreak: 'break-all' }}><strong>User Key:</strong> {summary.user_key}</div>
          <div style={{ wordBreak: 'break-all' }}><strong>Avatar:</strong> {summary.avatar_url || '-'}</div>
        </div>
      </div>

      <Section title="Recent Visitor Events">
        {visitors.length === 0 ? <Empty text="No visitor events." /> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 12 }}><tbody>
            {visitors.map((v) => (
              <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: 10, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatTokyoDateTime(v.created_at)}</td>
                <td style={{ padding: 10, maxWidth: 260, wordBreak: 'break-word' }}>{v.path || '-'}</td>
                <td style={{ padding: 10 }}>{v.page_type || '-'}</td>
                <td style={{ padding: 10, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.referrer || '-'}</td>
                <td style={{ padding: 10, fontFamily: 'monospace' }}>{v.ip || '-'}</td>
                <td style={{ padding: 10, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.user_agent || '-'}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </Section>

      <Section title="Recent Forum Posts">
        {posts.length === 0 ? <Empty text="No forum posts." /> : (
          <div style={{ padding: '0 16px' }}>{posts.map((p) => (
            <div key={p.id} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
              <Link href={`/forum/posts/${p.id}`} style={{ color: '#3b82f6', fontWeight: 700 }}>{p.title}</Link>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{p.category} | {p.status} | {formatTokyoDateTime(p.created_at)}</div>
            </div>
          ))}</div>
        )}
      </Section>

      <Section title="Recent Forum Comments">
        {comments.length === 0 ? <Empty text="No forum comments." /> : (
          <div style={{ padding: '0 16px' }}>{comments.map((c) => (
            <div key={c.id} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body || '-'}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                <Link href={`/forum/posts/${c.post_id}`} style={{ color: '#3b82f6' }}>post {c.post_id.slice(0, 8)}...</Link>
                {' | '}deleted: {String(c.is_deleted)} | {formatTokyoDateTime(c.created_at)}
              </div>
            </div>
          ))}</div>
        )}
      </Section>

      <Section title="Recent Lesson Progress">
        {progress.length === 0 ? <Empty text="No lesson progress." /> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 12 }}><tbody>
            {progress.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: 10, fontWeight: 700 }}>{p.lesson_id}</td>
                <td style={{ padding: 10, fontFamily: 'monospace' }}>{p.user_key}</td>
                <td style={{ padding: 10, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatTokyoDateTime(p.updated_at)}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </Section>

      <Section title="Recent Practice Attempts">
        {attempts.length === 0 ? <Empty text="No practice attempts." /> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 12 }}><tbody>
            {attempts.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: 10 }}>L{a.lesson_no}</td>
                <td style={{ padding: 10 }}>{a.item_type}</td>
                <td style={{ padding: 10, fontFamily: 'monospace' }}>{a.item_id}</td>
                <td style={{ padding: 10 }}>{a.mode}</td>
                <td style={{ padding: 10, color: a.is_correct ? '#166534' : '#991b1b', fontWeight: 700 }}>{a.is_correct ? 'Correct' : 'Wrong'}</td>
                <td style={{ padding: 10, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatTokyoDateTime(a.created_at)}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </Section>
    </>
  )
}
