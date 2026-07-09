import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'
import ForumPostActions from '@/components/forum-post-actions'

export const dynamic = 'force-dynamic'

const FORUM_ORIGIN = 'https://forum.jimmyyao.com'

function forumPostUrl(id: string) {
  return `${FORUM_ORIGIN}/posts/${id.replace(/-/g, '')}`
}

const CATEGORIES: Record<string, string> = {
  vocabulary: 'Vocabulary',
  wrong_question: 'Wrong Question',
  checkin: 'Check-in',
  announcement: 'Announcement',
  grammar: 'Grammar',
}

type ForumPost = {
  id: string
  author_user_id: string | null
  author_email: string | null
  title: string | null
  body: string | null
  category: string | null
  status: string | null
  comment_count: number | null
  is_pinned: boolean | null
  is_deleted: boolean | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string | null
  updated_at: string | null
}

type ForumComment = {
  id: string
  post_id: string | null
  author_user_id: string | null
  author_email: string | null
  body: string | null
  status: string | null
  is_deleted: boolean | null
  created_at: string | null
  updated_at: string | null
}

type ForumAdminAction = {
  id: string
  action: string
  previous_status: string | null
  next_status: string | null
  previous_is_deleted: boolean | null
  next_is_deleted: boolean | null
  review_note: string | null
  actor_email: string | null
  created_at: string | null
}

function statusLabel(status: string | null | undefined) {
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Rejected'
  if (status === 'hidden') return 'Hidden'
  return 'Pending'
}

function statusStyle(status: string | null | undefined) {
  if (status === 'approved') return { background: '#dcfce7', color: '#166534' }
  if (status === 'rejected') return { background: '#fee2e2', color: '#991b1b' }
  if (status === 'hidden') return { background: '#e2e8f0', color: '#334155' }
  return { background: '#fef3c7', color: '#92400e' }
}

function categoryLabel(category: string | null | undefined) {
  return category ? (CATEGORIES[category] || category) : '-'
}

export default async function ForumPostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  let post: ForumPost | null = null
  let postError: string | null = null

  try {
    const { data, error } = await supabase
      .from('forum_posts')
      .select('id,author_user_id,author_email,title,body,category,status,comment_count,is_pinned,is_deleted,reviewed_by,reviewed_at,review_note,created_at,updated_at')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        postError = 'not-found'
      } else {
        postError = error.message
      }
    } else {
      post = data as ForumPost
    }
  } catch (e) {
    postError = String(e)
  }

  let comments: ForumComment[] = []
  let commentError: string | null = null
  let commentTableChecked = false

  if (post && !postError) {
    try {
      const { data, error } = await supabase
        .from('forum_comments')
        .select('id,post_id,author_user_id,author_email,body,status,is_deleted,created_at,updated_at')
        .eq('post_id', id)
        .order('created_at', { ascending: true })
        .limit(100)

      if (error) {
        commentError = error.message
      } else {
        comments = (data || []) as ForumComment[]
      }
      commentTableChecked = true
    } catch {
      commentTableChecked = false
    }
  }

  let adminActions: ForumAdminAction[] = []
  let adminActionsError: string | null = null

  if (post && !postError) {
    try {
      const { data, error } = await supabase
        .from('forum_admin_actions')
        .select('id,action,previous_status,next_status,previous_is_deleted,next_is_deleted,review_note,actor_email,created_at')
        .eq('post_id', id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        adminActionsError = error.message
      } else {
        adminActions = (data || []) as ForumAdminAction[]
      }
    } catch {
      adminActionsError = 'Failed to load admin action history'
    }
  }

  if (postError === 'not-found') {
    return (
      <>
        <div className="page-header">
          <h1>Post Not Found</h1>
          <p>The requested forum post does not exist or may have been deleted.</p>
        </div>
        <div className="placeholder-card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 16 }}>Post ID: {id}</p>
          <Link href="/forum" style={{ color: '#3b82f6', fontSize: 14 }}>← Back to Forum Management</Link>
        </div>
      </>
    )
  }

  if (postError) {
    return (
      <>
        <div className="page-header">
          <h1>Error</h1>
          <p>Failed to load forum post details.</p>
        </div>
        <div className="placeholder-card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: '#dc2626', fontSize: 14, marginBottom: 16 }}>{postError}</p>
          <Link href="/forum" style={{ color: '#3b82f6', fontSize: 14 }}>← Back to Forum Management</Link>
        </div>
      </>
    )
  }

  const s = statusStyle(post!.status)

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href="/forum" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>← Back to Forum Management</Link>
      </div>

      <div className="page-header" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, wordBreak: 'break-word' }}>{post!.title || 'Untitled'}</h1>
          {post!.is_pinned ? (
            <span style={{ fontSize: 11, background: '#e0e7ff', color: '#4338ca', borderRadius: 4, padding: '2px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>Pinned</span>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-card-label">Author</div>
          <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, wordBreak: 'break-all' }}>
            {post!.author_email || (post!.author_user_id ? `${post!.author_user_id.slice(0, 12)}...` : '-')}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Category</div>
          <div>
            <span style={{ fontSize: 12, background: '#f1f5f9', color: '#475569', borderRadius: 999, padding: '3px 10px', fontWeight: 600 }}>{categoryLabel(post!.category)}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Status</div>
          <div>
            <span style={{ ...s, fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>{statusLabel(post!.status)}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Replies</div>
          <div className="stat-card-value" style={{ fontSize: 20 }}>{post!.comment_count ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Created</div>
          <div style={{ fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatTokyoDateTime(post!.created_at)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Updated</div>
          <div style={{ fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#64748b' }}>{formatTokyoDateTime(post!.updated_at)}</div>
        </div>
      </div>

      <div className="placeholder-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Content</h2>
          <a
            href={forumPostUrl(post!.id)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, color: '#3b82f6', textDecoration: 'none' }}
          >
            View on forum ↗
          </a>
        </div>
        {post!.status !== 'approved' ? (
          <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>Only approved posts are visible on the public forum.</p>
        ) : null}
        <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#0f172a' }}>
          {post!.body || 'No content.'}
        </div>
      </div>

      {post!.review_note ? (
        <div className="placeholder-card" style={{ marginBottom: 16, background: '#fefce8', border: '1px solid #fde68a' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#92400e' }}>Review Note</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#78350f' }}>{post!.review_note}</p>
          {post!.reviewed_by ? (
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#a16207', fontFamily: 'monospace' }}>
              Reviewed by: {post!.reviewed_by.slice(0, 12)}...
              {post!.reviewed_at ? ` at ${formatTokyoDateTime(post!.reviewed_at)}` : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="placeholder-card" style={{ overflowX: 'auto', padding: 0 }}>
        <h2 style={{ margin: 0, padding: '16px 16px 0', fontSize: 16, fontWeight: 700 }}>
          Comments
          {commentTableChecked ? ` (${comments.length})` : ''}
        </h2>

        {!commentTableChecked ? (
          <p style={{ padding: '16px 16px', fontSize: 13, color: '#94a3b8' }}>
            Comments table is not available yet.
          </p>
        ) : commentError ? (
          <p style={{ padding: '16px 16px', fontSize: 13, color: '#94a3b8' }}>
            Comments table is not available yet.
          </p>
        ) : comments.length === 0 ? (
          <p style={{ padding: '16px 16px', fontSize: 13, color: '#94a3b8' }}>
            No comments on this post.
          </p>
        ) : (
          <div style={{ padding: '0 16px', marginTop: 12 }}>
            {comments.map((comment) => (
              <div key={comment.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: '#475569' }}>
                    {comment.author_email || (comment.author_user_id ? `${comment.author_user_id.slice(0, 8)}...` : 'Anonymous')}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>
                    {formatTokyoDateTime(comment.created_at)}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {comment.body || '-'}
                </p>
                {comment.status && comment.status !== 'approved' ? (
                  <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>{statusLabel(comment.status)}</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="placeholder-card" style={{ overflowX: 'auto', padding: 0 }}>
        <h2 style={{ margin: 0, padding: '16px 16px 0', fontSize: 16, fontWeight: 700 }}>
          Admin Action History
        </h2>

        {adminActionsError ? (
          <p style={{ padding: '16px 16px', fontSize: 13, color: '#94a3b8' }}>
            Admin action log is not available yet.
          </p>
        ) : adminActions.length === 0 ? (
          <p style={{ padding: '16px 16px', fontSize: 13, color: '#94a3b8' }}>
            No admin actions recorded for this post.
          </p>
        ) : (
          <div style={{ padding: '0 16px', marginTop: 12 }}>
            {adminActions.map((a) => (
              <div key={a.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{a.action}</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>
                    {formatTokyoDateTime(a.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                  status: {a.previous_status || '-'} → {a.next_status || '-'}
                  {a.previous_is_deleted !== null || a.next_is_deleted !== null
                    ? ` | deleted: ${a.previous_is_deleted ?? '-'} → ${a.next_is_deleted ?? '-'}`
                    : ''}
                </div>
                {a.review_note ? (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#78350f' }}>{a.review_note}</p>
                ) : null}
                {a.actor_email ? (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>by {a.actor_email}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <ForumPostActions
        postId={post!.id}
        currentStatus={post!.status}
        isDeleted={post!.is_deleted}
        currentReviewNote={post!.review_note}
      />
    </>
  )
}
