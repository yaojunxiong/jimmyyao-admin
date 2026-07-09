import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { checkAdminAccess } from '@/lib/admin-auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const cookieStore = await cookies()

  const adminCheck = await checkAdminAccess(cookieStore)

  if (!adminCheck.userAuthed) {
    return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  }

  if (!adminCheck.isAdmin) {
    return Response.json({ ok: false, error: 'Not authorized' }, { status: 403 })
  }

  let body: { action?: string; review_note?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { action, review_note } = body
  const validActions = ['approve', 'reject', 'hide', 'restore']

  if (!action || !validActions.includes(action)) {
    return Response.json({ ok: false, error: `Invalid action. Must be one of: ${validActions.join(', ')}` }, { status: 400 })
  }

  const supabase = createClient(cookieStore)

  // Read current post state before update
  const { data: currentPost, error: readError } = await supabase
    .from('forum_posts')
    .select('status, is_deleted')
    .eq('id', id)
    .single()

  if (readError) {
    return Response.json({ ok: false, error: `Failed to read current post state: ${readError.message}` }, { status: 500 })
  }

  const now = new Date().toISOString()

  const baseUpdate: Record<string, string | boolean | null> = {
    updated_at: now,
  }

  switch (action) {
    case 'approve':
      Object.assign(baseUpdate, {
        status: 'approved',
        reviewed_by: adminCheck.userId,
        reviewed_at: now,
        review_note: review_note || null,
        is_deleted: false,
      })
      break

    case 'reject':
      Object.assign(baseUpdate, {
        status: 'rejected',
        reviewed_by: adminCheck.userId,
        reviewed_at: now,
        review_note: review_note || null,
      })
      break

    case 'hide':
      Object.assign(baseUpdate, {
        status: 'hidden',
        reviewed_by: adminCheck.userId,
        reviewed_at: now,
        review_note: review_note || null,
      })
      break

    case 'restore':
      Object.assign(baseUpdate, {
        is_deleted: false,
      })
      break
  }

  try {
    const { error } = await supabase
      .from('forum_posts')
      .update(baseUpdate)
      .eq('id', id)

    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 })
    }

    // Insert audit log
    const nextStatus = baseUpdate.status as string | undefined
    const nextIsDeleted = baseUpdate.is_deleted as boolean | undefined

    const { error: auditError } = await supabase
      .from('forum_admin_actions')
      .insert({
        post_id: id,
        action,
        previous_status: currentPost.status,
        next_status: nextStatus ?? null,
        previous_is_deleted: currentPost.is_deleted,
        next_is_deleted: nextIsDeleted ?? null,
        review_note: review_note || null,
        actor_user_id: adminCheck.userId,
        actor_email: adminCheck.userEmail,
      })

    if (auditError) {
      console.error('Post updated but audit log insert failed:', auditError)
      return Response.json({ ok: true, warning: `Post updated successfully, but audit log could not be recorded: ${auditError.message}` })
    }

    revalidatePath('/forum')
    revalidatePath(`/forum/posts/${id}`)

    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
