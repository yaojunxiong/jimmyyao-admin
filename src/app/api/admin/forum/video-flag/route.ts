import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { checkAdminAccess } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'
import {
  hasApiGuard,
  validateVideoFlagBody,
  EMPTY_VALUE,
  ADMIN_VALUE,
  FLAG_KEY,
} from '@/lib/richtext/video-flag-operator'

export async function POST(request: NextRequest) {
  if (!hasApiGuard()) {
    return Response.json(
      { ok: false, error: 'Video flag operator API is not enabled' },
      { status: 403 },
    )
  }

  try {
    const cookieStore = await cookies()
    const adminCheck = await checkAdminAccess(cookieStore)
    if (!adminCheck.userAuthed) {
      return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
    }
    if (!adminCheck.isAdmin || adminCheck.role !== 'admin') {
      return Response.json({ ok: false, error: 'Not authorized' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    const validation = validateVideoFlagBody(body)
    if (!validation.ok) {
      return Response.json({ ok: false, error: validation.error }, { status: validation.status })
    }

    const supabase = createClient(cookieStore)
    const newValue = validation.enabled ? ADMIN_VALUE : EMPTY_VALUE

    const { error } = await supabase
      .from('feature_flags')
      .update({ value: newValue, updated_at: new Date().toISOString() })
      .eq('key', FLAG_KEY)

    if (error) {
      return Response.json({ ok: false, error: 'Failed to update feature flag' }, { status: 500 })
    }

    return Response.json({ ok: true, enabled: validation.enabled, key: FLAG_KEY })
  } catch {
    return Response.json({ ok: false, error: 'Unable to update feature flag' }, { status: 500 })
  }
}
