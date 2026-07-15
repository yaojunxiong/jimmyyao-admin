import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getConfiguredSupabaseProjectOrigin } from '@/lib/supabase/config'
import { checkAdminAccess } from '@/lib/admin-auth'
import {
  isLocalVideoUploadFeatureEnabled,
  isRichTextFeatureEnabled,
} from '@/lib/richtext/server-feature-flag'
import ForumPostEditForm from './forum-post-edit-form'

export const dynamic = 'force-dynamic'

const CATEGORIES = [
  { value: 'grammar', label: 'Grammar' },
  { value: 'vocabulary', label: 'Vocabulary' },
  { value: 'wrong_question', label: 'Wrong Question' },
  { value: 'checkin', label: 'Check-in' },
  { value: 'announcement', label: 'Announcement' },
] as const

type ForumPost = {
  id: string
  title: string
  body: string
  category: string
  content_format: string | null
  content_json: unknown
  content_html: string | null
  content_text: string | null
}

export default async function EditForumPostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cookieStore = await cookies()
  const adminCheck = await checkAdminAccess(cookieStore)

  if (!adminCheck.userAuthed) {
    redirect('/login')
  }

  if (!adminCheck.isAdmin || adminCheck.role !== 'admin') {
    return (
      <div className="placeholder-card" style={{ textAlign: 'center', padding: 40 }}>
        <h2>Access Denied</h2>
        <p style={{ color: '#64748b' }}>Only administrators can edit forum posts.</p>
        <Link href={`/forum/posts/${id}`} style={{ color: '#3b82f6', fontSize: 14 }}>← Back to Post</Link>
      </div>
    )
  }

  const supabase = createClient(cookieStore)

  let post: ForumPost | null = null
  let postError: string | null = null

  try {
    const { data, error } = await supabase
      .from('forum_posts')
      .select('id,title,body,category,content_format,content_json,content_html,content_text')
      .eq('id', id)
      .single()

    if (error) {
      postError = error.message
    } else {
      post = data as ForumPost
    }
  } catch (e) {
    postError = String(e)
  }

  if (postError || !post) {
    return (
      <>
        <div className="page-header">
          <h1>Post Not Found</h1>
          <p>{postError || 'The requested post does not exist.'}</p>
        </div>
        <Link href="/forum" style={{ color: '#3b82f6', fontSize: 14 }}>← Back to Forum Management</Link>
      </>
    )
  }

  const [richTextEnabled, localVideoFlagEnabled] = await Promise.all([
    isRichTextFeatureEnabled(supabase, adminCheck.role),
    isLocalVideoUploadFeatureEnabled(supabase, adminCheck.role),
  ])
  const localVideoApprovedOrigin = getConfiguredSupabaseProjectOrigin()
  const localVideoUploadEnabled = localVideoFlagEnabled
    && Boolean(localVideoApprovedOrigin)

  const initialRichJson = post.content_format === 'rich_text' ? post.content_json : null
  const initialRichHtml = post.content_format === 'rich_text' ? post.content_html : ''

  if (post.content_format === 'rich_text' && !richTextEnabled) {
    return (
      <>
        <div className="page-header">
          <h1>Rich-text editing is disabled</h1>
          <p>This post is unchanged. Re-enable the admin feature flag before editing it.</p>
        </div>
        <Link href={`/forum/posts/${id}`} style={{ color: '#3b82f6', fontSize: 14 }}>
          ← Back to Post
        </Link>
      </>
    )
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href={`/forum/posts/${id}`} style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>
          ← Back to Post
        </Link>
      </div>

      <div className="page-header">
        <h1>Edit Forum Post</h1>
      </div>

      <ForumPostEditForm
        postId={post.id}
        initialTitle={post.title}
        initialCategory={post.category}
        initialFormat={post.content_format || 'plain_text'}
        initialBody={post.body}
        initialRichHtml={initialRichHtml}
        initialRichJson={initialRichJson}
        categories={[...CATEGORIES]}
        localVideoUploadEnabled={localVideoUploadEnabled}
        localVideoApprovedOrigin={localVideoApprovedOrigin}
      />
    </>
  )
}
