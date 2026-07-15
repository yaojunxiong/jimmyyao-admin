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
import ForumPostForm from './forum-post-form'

export const dynamic = 'force-dynamic'

const CATEGORIES = [
  { value: 'grammar', label: 'Grammar' },
  { value: 'vocabulary', label: 'Vocabulary' },
  { value: 'wrong_question', label: 'Wrong Question' },
  { value: 'checkin', label: 'Check-in' },
  { value: 'announcement', label: 'Announcement' },
] as const

export default async function CreateForumPostPage() {
  const cookieStore = await cookies()
  const adminCheck = await checkAdminAccess(cookieStore)

  if (!adminCheck.userAuthed) {
    redirect('/login')
  }

  if (!adminCheck.isAdmin || adminCheck.role !== 'admin') {
    return (
      <div className="placeholder-card" style={{ textAlign: 'center', padding: 40 }}>
        <h2>Access Denied</h2>
        <p style={{ color: '#64748b' }}>Only administrators can create forum posts.</p>
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Role: {adminCheck.role}</p>
        <Link href="/forum" style={{ color: '#3b82f6', fontSize: 14 }}>← Back to Forum Management</Link>
      </div>
    )
  }

  const supabase = createClient(cookieStore)
  const [richTextEnabled, localVideoFlagEnabled] = await Promise.all([
    isRichTextFeatureEnabled(supabase, adminCheck.role),
    isLocalVideoUploadFeatureEnabled(supabase, adminCheck.role),
  ])
  const localVideoApprovedOrigin = getConfiguredSupabaseProjectOrigin()
  const localVideoUploadEnabled = localVideoFlagEnabled
    && Boolean(localVideoApprovedOrigin)

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href="/forum" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>
          ← Back to Forum Management
        </Link>
      </div>

      <div className="page-header">
        <h1>Create Forum Post</h1>
        <p>Create a new forum post as administrator.</p>
      </div>

      <ForumPostForm
        categories={[...CATEGORIES]}
        adminEmail={adminCheck.userEmail}
        richTextEnabled={richTextEnabled}
        localVideoUploadEnabled={localVideoUploadEnabled}
        localVideoApprovedOrigin={localVideoApprovedOrigin}
      />
    </>
  )
}
