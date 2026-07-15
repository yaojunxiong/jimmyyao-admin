export const FLAG_KEY = 'forum_local_video_upload' as const

export const EMPTY_VALUE = { enabled_for: [] as string[] }
export const ADMIN_VALUE = { enabled_for: ['admin'] as string[] }

export function hasApiGuard(): boolean {
  return process.env.ENABLE_VIDEO_FLAG_OPERATOR_API === 'true'
}

export function validateVideoFlagBody(
  body: unknown,
): { ok: true; enabled: boolean } | { ok: false; error: string; status: number } {
  if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid JSON body', status: 400 }
  }

  const { enabled } = body as Record<string, unknown>

  if (typeof enabled !== 'boolean') {
    return { ok: false, error: 'Missing or invalid "enabled" field — must be a boolean', status: 400 }
  }

  return { ok: true, enabled }
}
