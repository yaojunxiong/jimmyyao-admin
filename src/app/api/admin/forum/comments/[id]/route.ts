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

  let body: { action?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { action } = body

  if (!action || !['hide', 'restore'].includes(action)) {
    return Response.json({ ok: false, error: 'Invalid action. Must be one of: hide, restore' }, { status: 400 })
  }

  const supabase = createClient(cookieStore)

  try {
    const { data, error } = await supabase.rpc('admin_update_forum_comment_status', {
      p_comment_id: id,
      p_action: action,
    })

    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 })
    }

    const result = data as {
      success: boolean
      error?: string
      comment_id?: string
      post_id?: string
      action?: string
      new_is_deleted?: boolean
    }

    if (!result.success) {
      if (result.error === 'not_authenticated') {
        return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
      }
      if (result.error === 'not_authorized') {
        return Response.json({ ok: false, error: 'Not authorized' }, { status: 403 })
      }
      if (result.error === 'comment_not_found') {
        return Response.json({ ok: false, error: 'Comment not found' }, { status: 404 })
      }
      return Response.json({ ok: false, error: result.error || 'Unknown error' }, { status: 500 })
    }

    revalidatePath('/forum/comments')
    if (result.post_id) {
      revalidatePath(`/forum/posts/${result.post_id}`)
    }

    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
