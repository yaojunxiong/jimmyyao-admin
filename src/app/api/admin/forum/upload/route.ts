import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { checkAdminAccess } from '@/lib/admin-auth'
import {
  MAX_IMAGE_SIZE,
  validateImageUpload,
} from '@/lib/richtext/image-upload'
import { isRichTextFeatureEnabled } from '@/lib/richtext/server-feature-flag'
import { createClient } from '@/lib/supabase/server'

const UPLOAD_BUCKET = 'forum-media'
const MAX_FILES_PER_REQUEST = 1

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const adminCheck = await checkAdminAccess(cookieStore)

  if (!adminCheck.userAuthed) {
    return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  }

  if (!adminCheck.isAdmin || adminCheck.role !== 'admin') {
    return Response.json({ ok: false, error: 'Not authorized' }, { status: 403 })
  }

  const supabase = createClient(cookieStore)
  if (!(await isRichTextFeatureEnabled(supabase, adminCheck.role))) {
    return Response.json({ ok: false, error: 'Rich-text uploads are disabled' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const entries = formData.getAll('files')
    const files = entries.filter((entry): entry is File => entry instanceof File)

    if (files.length === 0 || files.length !== entries.length) {
      return Response.json({ ok: false, error: 'No valid image provided' }, { status: 400 })
    }

    if (files.length > MAX_FILES_PER_REQUEST) {
      return Response.json(
        { ok: false, error: 'Upload one image at a time' },
        { status: 400 },
      )
    }

    const file = files[0]
    if (file.size > MAX_IMAGE_SIZE) {
      return Response.json(
        { ok: false, error: 'Image is too large (maximum 4 MB)' },
        { status: 400 },
      )
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const validation = validateImageUpload({
      name: file.name,
      declaredMime: file.type,
      size: file.size,
      bytes,
    })

    if (!validation.ok) {
      return Response.json({ ok: false, error: validation.error }, { status: 400 })
    }

    const safeFilename = `${crypto.randomUUID()}.${validation.extension}`
    const filePath = `uploads/${safeFilename}`
    const { error: uploadError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .upload(filePath, bytes, {
        contentType: validation.mime,
        upsert: false,
      })

    if (uploadError) {
      return Response.json({ ok: false, error: 'Storage upload failed' }, { status: 502 })
    }

    const { data: urlData } = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(filePath)
    return Response.json({
      ok: true,
      data: {
        uploaded: [{ url: urlData.publicUrl, filename: file.name }],
        errors: [],
      },
    })
  } catch {
    return Response.json({ ok: false, error: 'Unable to process image upload' }, { status: 500 })
  }
}
