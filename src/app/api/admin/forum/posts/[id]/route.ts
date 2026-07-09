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
    const supabase = createClient(cookieStore)
    const { error } = await supabase
      .from('forum_posts')
      .update(baseUpdate)
      .eq('id', id)

    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 })
    }

    revalidatePath('/forum')
    revalidatePath(`/forum/posts/${id}`)

    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
