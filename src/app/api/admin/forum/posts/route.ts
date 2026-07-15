import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { checkAdminAccess } from '@/lib/admin-auth'
import { preparePostInput } from '@/lib/richtext/post-input'
import {
  isLocalVideoUploadFeatureEnabled,
  isRichTextFeatureEnabled,
} from '@/lib/richtext/server-feature-flag'
import { validateFinalizedVideoPaths } from '@/lib/richtext/video-upload-server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const adminCheck = await checkAdminAccess(cookieStore)

    if (!adminCheck.userAuthed) {
      return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
    }

    if (!adminCheck.isAdmin || adminCheck.role !== 'admin') {
      return Response.json({ ok: false, error: 'Not authorized' }, { status: 403 })
    }

    let requestBody: unknown
    try {
      requestBody = await request.json()
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
      return Response.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
    }

    const supabase = createClient(cookieStore)
    const [richTextEnabled, localVideoUploadEnabled] = await Promise.all([
      isRichTextFeatureEnabled(supabase, adminCheck.role),
      isLocalVideoUploadFeatureEnabled(supabase, adminCheck.role),
    ])

    const prepared = await preparePostInput(requestBody, {
      localVideoUploadEnabled,
    })
    if (!prepared.ok) {
      return Response.json(
        { ok: false, error: prepared.error },
        { status: prepared.status || 400 },
      )
    }

    if (
      prepared.value.contentFormat === 'rich_text'
      && !richTextEnabled
    ) {
      return Response.json({ ok: false, error: 'Rich-text editing is disabled' }, { status: 403 })
    }

    const videoValidation = await validateFinalizedVideoPaths(
      prepared.value.forumVideoPaths,
      async (objectPaths) => {
        const { data: videos, error: videoError } = await supabase
          .from('forum_video_uploads')
          .select('object_path')
          .eq('status', 'finalized')
          .in('object_path', [...objectPaths])

        return {
          objectPaths: (videos || []).map((video) => video.object_path as string),
          error: Boolean(videoError),
        }
      },
    )
    if (!videoValidation.ok) {
      return Response.json(
        { ok: false, error: videoValidation.error },
        { status: videoValidation.status },
      )
    }

    const { data, error } = await supabase.rpc('admin_create_forum_post', {
      p_title: prepared.value.title,
      p_body: prepared.value.body,
      p_category: prepared.value.category,
      p_content_format: prepared.value.contentFormat,
      p_content_json: prepared.value.contentJson,
      p_content_html: prepared.value.contentHtml,
      p_content_text: prepared.value.contentText,
    })

    if (error) {
      return Response.json({ ok: false, error: 'Unable to create forum post' }, { status: 500 })
    }

    const result = data as { success: boolean; error?: string; post_id?: string }
    if (!result.success) {
      if (result.error === 'not_authenticated') {
        return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
      }
      if (result.error === 'not_authorized') {
        return Response.json({ ok: false, error: 'Not authorized' }, { status: 403 })
      }
      if (result.error?.startsWith('invalid_')) {
        return Response.json({ ok: false, error: 'Invalid forum post' }, { status: 400 })
      }
      return Response.json({ ok: false, error: 'Unable to create forum post' }, { status: 500 })
    }

    revalidatePath('/forum')
    revalidatePath(`/forum/posts/${result.post_id}`)
    return Response.json({ ok: true, post_id: result.post_id })
  } catch {
    return Response.json({ ok: false, error: 'Unable to create forum post' }, { status: 500 })
  }
}
