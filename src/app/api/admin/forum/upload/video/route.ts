import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { checkAdminAccess } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'
import { getConfiguredSupabaseProjectOrigin } from '@/lib/supabase/config'
import { isLocalVideoUploadFeatureEnabled } from '@/lib/richtext/server-feature-flag'
import {
  buildVideoPaths,
  FORUM_VIDEO_BUCKET,
  isApprovedSignedVideoUploadUrl,
  validateVideoUploadInput,
} from '@/lib/richtext/video-upload'
import {
  authorizeVideoAdmin,
  evaluateHourlyReservationCount,
  videoMethodNotAllowed,
  videoJsonResponse,
} from '@/lib/richtext/video-upload-server'

export const runtime = 'nodejs'

export const GET = videoMethodNotAllowed
export const HEAD = videoMethodNotAllowed
export const PUT = videoMethodNotAllowed
export const PATCH = videoMethodNotAllowed
export const DELETE = videoMethodNotAllowed
export const OPTIONS = videoMethodNotAllowed

type ReservationRpcResult = {
  success?: boolean
  error?: string
  reservation_id?: string
  expires_at?: string
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const adminCheck = await checkAdminAccess(cookieStore)
    const authFailure = authorizeVideoAdmin(adminCheck)
    if (authFailure) {
      return videoJsonResponse({ ok: false, error: authFailure.error }, authFailure.status)
    }

    const supabase = createClient(cookieStore)
    if (!(await isLocalVideoUploadFeatureEnabled(supabase, adminCheck.role))) {
      return videoJsonResponse(
        { ok: false, error: 'Local video uploads are disabled' },
        403,
      )
    }
    if (!getConfiguredSupabaseProjectOrigin()) {
      return videoJsonResponse(
        { ok: false, error: 'Local video Storage is not configured' },
        503,
      )
    }

    let body: { name?: unknown; size?: unknown; type?: unknown }
    try {
      body = await request.json()
    } catch {
      return videoJsonResponse({ ok: false, error: 'Invalid JSON body' }, 400)
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return videoJsonResponse({ ok: false, error: 'Invalid request body' }, 400)
    }

    if (typeof body.name !== 'string' || !body.name.trim()) {
      return videoJsonResponse({ ok: false, error: 'Missing video filename' }, 400)
    }
    if (typeof body.size !== 'number') {
      return videoJsonResponse({ ok: false, error: 'Missing or invalid video file size' }, 400)
    }
    if (typeof body.type !== 'string' || !body.type) {
      return videoJsonResponse({ ok: false, error: 'Missing video MIME type' }, 400)
    }

    const validation = validateVideoUploadInput({
      name: body.name,
      declaredMime: body.type,
      size: body.size,
    })
    if (!validation.ok) {
      return videoJsonResponse({ ok: false, error: validation.error }, 400)
    }

    const adminId = adminCheck.userId as string
    const { count, error: countError } = await supabase
      .from('forum_video_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('admin_id', adminId)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    const limitFailure = evaluateHourlyReservationCount(count, Boolean(countError))
    if (limitFailure) {
      return videoJsonResponse({ ok: false, error: limitFailure.error }, limitFailure.status)
    }

    const { uploadPath, objectPath } = buildVideoPaths(adminId, validation.mime)
    const { data: reservationData, error: reservationError } = await supabase.rpc(
      'admin_reserve_forum_video',
      {
        p_upload_path: uploadPath,
        p_object_path: objectPath,
        p_original_name: body.name,
        p_mime_type: validation.mime,
        p_file_size: body.size,
      },
    )

    if (reservationError) {
      return videoJsonResponse(
        { ok: false, error: 'Failed to create upload reservation' },
        500,
      )
    }

    const reservation = reservationData as ReservationRpcResult | null
    if (!reservation?.success || !reservation.reservation_id || !reservation.expires_at) {
      if (reservation?.error === 'feature_disabled') {
        return videoJsonResponse(
          { ok: false, error: 'Local video uploads are disabled' },
          403,
        )
      }
      if (reservation?.error === 'rate_limited') {
        return videoJsonResponse(
          { ok: false, error: 'Video upload limit reached (maximum 10 per hour)' },
          429,
        )
      }
      if (reservation?.error === 'path_conflict') {
        return videoJsonResponse({ ok: false, error: 'Upload path already exists' }, 409)
      }
      if (reservation?.error === 'not_authenticated') {
        return videoJsonResponse({ ok: false, error: 'Not authenticated' }, 401)
      }
      if (reservation?.error === 'not_authorized') {
        return videoJsonResponse({ ok: false, error: 'Not authorized' }, 403)
      }
      return videoJsonResponse(
        { ok: false, error: 'Failed to create upload reservation' },
        500,
      )
    }

    const { data: signedUpload, error: signedUploadError } = await supabase.storage
      .from(FORUM_VIDEO_BUCKET)
      .createSignedUploadUrl(uploadPath, { upsert: false })

    if (
      signedUploadError
      || !signedUpload
      || signedUpload.path !== uploadPath
      || !isApprovedSignedVideoUploadUrl(signedUpload.signedUrl, uploadPath)
    ) {
      return videoJsonResponse(
        { ok: false, error: 'Failed to authorize direct Storage upload' },
        502,
      )
    }

    return videoJsonResponse({
      ok: true,
      data: {
        reservationId: reservation.reservation_id,
        uploadPath,
        signedUrl: signedUpload.signedUrl,
        mimeType: validation.mime,
        expiresAt: reservation.expires_at,
      },
    })
  } catch {
    return videoJsonResponse(
      { ok: false, error: 'Unable to process upload request' },
      500,
    )
  }
}
