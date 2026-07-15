import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { checkAdminAccess } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'
import { getConfiguredSupabaseProjectOrigin } from '@/lib/supabase/config'
import { isLocalVideoUploadFeatureEnabled } from '@/lib/richtext/server-feature-flag'
import {
  buildForumVideoPublicUrl,
  buildReservedForumVideoPublicUrl,
  FORUM_VIDEO_BUCKET,
  isAllowedVideoMime,
} from '@/lib/richtext/video-upload'
import {
  authorizeVideoAdmin,
  readVideoHeader,
  RESERVATION_ID_PATTERN,
  verifyStoredVideo,
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

type ReservationRow = {
  id: string
  admin_id: string
  upload_path: string
  object_path: string
  mime_type: string
  file_size: number
  status: string
  expires_at: string
  finalized_at: string | null
}

type FinalizeRpcResult = {
  success?: boolean
  error?: string
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

    let body: { reservationId?: unknown }
    try {
      body = await request.json()
    } catch {
      return videoJsonResponse({ ok: false, error: 'Invalid JSON body' }, 400)
    }

    if (
      !body
      || typeof body !== 'object'
      || Array.isArray(body)
      || typeof body.reservationId !== 'string'
      || !RESERVATION_ID_PATTERN.test(body.reservationId)
    ) {
      return videoJsonResponse({ ok: false, error: 'Missing or invalid reservation ID' }, 400)
    }

    const { data: reservationData, error: fetchError } = await supabase
      .from('forum_video_uploads')
      .select(
        'id, admin_id, upload_path, object_path, mime_type, file_size, status, expires_at, finalized_at',
      )
      .eq('id', body.reservationId)
      .maybeSingle()

    const reservation = reservationData as ReservationRow | null
    if (fetchError || !reservation) {
      return videoJsonResponse({ ok: false, error: 'Upload reservation not found' }, 404)
    }

    if (reservation.admin_id !== adminCheck.userId) {
      return videoJsonResponse(
        { ok: false, error: 'Reservation does not belong to this user' },
        403,
      )
    }

    const publicUrl = buildForumVideoPublicUrl(reservation.object_path)
    if (!publicUrl || !isAllowedVideoMime(reservation.mime_type)) {
      return videoJsonResponse({ ok: false, error: 'Upload reservation is invalid' }, 500)
    }

    const wasAlreadyFinalized = reservation.status === 'finalized'
      && Boolean(reservation.finalized_at)

    if (!wasAlreadyFinalized && reservation.status !== 'reserved') {
      return videoJsonResponse(
        { ok: false, error: `Reservation is ${reservation.status}, expected reserved` },
        400,
      )
    }

    const reservationExpired =
      new Date(reservation.expires_at).getTime() <= Date.now()

    const expectedSize = Number(reservation.file_size)
    if (!Number.isSafeInteger(expectedSize) || expectedSize < 1) {
      return videoJsonResponse({ ok: false, error: 'Upload reservation size is invalid' }, 500)
    }

    const storage = supabase.storage.from(FORUM_VIDEO_BUCKET)
    let verificationPath = wasAlreadyFinalized
      ? reservation.object_path
      : reservation.upload_path
    let verificationUrl = wasAlreadyFinalized
      ? publicUrl
      : buildReservedForumVideoPublicUrl(reservation.upload_path)
    let objectAlreadyMoved = wasAlreadyFinalized
    let { data: objectInfo, error: infoError } = await storage.info(verificationPath)

    if (!wasAlreadyFinalized && (infoError || !objectInfo)) {
      verificationPath = reservation.object_path
      verificationUrl = publicUrl
      const finalInfo = await storage.info(verificationPath)
      objectInfo = finalInfo.data
      infoError = finalInfo.error
      objectAlreadyMoved = Boolean(objectInfo && !infoError)
    }

    if (infoError || !objectInfo || !verificationUrl) {
      return videoJsonResponse({ ok: false, error: 'Uploaded file not found in Storage' }, 404)
    }

    // An expired reservation cannot move new bytes. If a previous request
    // already moved this exact object before expiry, continue verification so
    // the database row can recover to the finalized state idempotently.
    if (!wasAlreadyFinalized && reservationExpired && !objectAlreadyMoved) {
      return videoJsonResponse({ ok: false, error: 'Upload reservation has expired' }, 410)
    }

    const headerResult = await readVideoHeader(verificationUrl, expectedSize)
    if (!headerResult.ok) {
      return videoJsonResponse({ ok: false, error: headerResult.error }, 502)
    }

    const verification = verifyStoredVideo({
      expectedMime: reservation.mime_type,
      expectedSize,
      headerBytes: headerResult.bytes,
      info: {
        size: objectInfo.size,
        contentType: objectInfo.contentType,
      },
    })
    if (!verification.ok) {
      return videoJsonResponse({ ok: false, error: verification.error }, 400)
    }

    if (!objectAlreadyMoved) {
      const { error: moveError } = await storage.move(
        reservation.upload_path,
        reservation.object_path,
      )
      if (moveError) {
        // A concurrent retry may have completed the move after this request
        // verified the reserved object. Confirm the exact final path before
        // treating the move error as a failure; never infer success from a
        // folder listing.
        const { data: movedInfo, error: movedInfoError } = await storage.info(
          reservation.object_path,
        )
        if (movedInfoError || !movedInfo) {
          return videoJsonResponse(
            { ok: false, error: 'Storage could not finalize the video object' },
            502,
          )
        }

        const movedHeader = await readVideoHeader(publicUrl, expectedSize)
        if (!movedHeader.ok) {
          return videoJsonResponse({ ok: false, error: movedHeader.error }, 502)
        }
        const movedVerification = verifyStoredVideo({
          expectedMime: reservation.mime_type,
          expectedSize,
          headerBytes: movedHeader.bytes,
          info: {
            size: movedInfo.size,
            contentType: movedInfo.contentType,
          },
        })
        if (!movedVerification.ok) {
          return videoJsonResponse({ ok: false, error: movedVerification.error }, 400)
        }
      }
    }

    if (!wasAlreadyFinalized) {
      const { data: finalizeData, error: finalizeError } = await supabase.rpc(
        'admin_finalize_forum_video',
        { p_reservation_id: reservation.id },
      )
      const finalized = finalizeData as FinalizeRpcResult | null
      if (finalizeError || !finalized?.success) {
        if (finalized?.error === 'feature_disabled') {
          return videoJsonResponse(
            { ok: false, error: 'Local video uploads are disabled' },
            403,
          )
        }
        if (finalized?.error === 'reservation_expired') {
          return videoJsonResponse({ ok: false, error: 'Upload reservation has expired' }, 410)
        }
        if (finalized?.error === 'reservation_not_found') {
          return videoJsonResponse({ ok: false, error: 'Upload reservation not found' }, 404)
        }
        if (finalized?.error === 'not_authenticated') {
          return videoJsonResponse({ ok: false, error: 'Not authenticated' }, 401)
        }
        if (finalized?.error === 'not_authorized') {
          return videoJsonResponse({ ok: false, error: 'Not authorized' }, 403)
        }
        return videoJsonResponse(
          { ok: false, error: 'Failed to finalize upload reservation' },
          500,
        )
      }
    }

    return videoJsonResponse({
      ok: true,
      data: {
        publicUrl,
        objectPath: reservation.object_path,
        mimeType: reservation.mime_type,
        fileSize: expectedSize,
      },
    })
  } catch {
    return videoJsonResponse({ ok: false, error: 'Unable to finalize upload' }, 500)
  }
}
