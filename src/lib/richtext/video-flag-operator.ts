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

  const record = body as Record<string, unknown>
  const keys = Object.keys(record)

  if (keys.length === 0) {
    return { ok: false, error: 'Missing "enabled" field — must be a boolean', status: 400 }
  }

  if (keys.length !== 1 || keys[0] !== 'enabled') {
    return { ok: false, error: 'Body must contain only the "enabled" field', status: 400 }
  }

  if (typeof record.enabled !== 'boolean') {
    return { ok: false, error: 'Invalid "enabled" field — must be a boolean', status: 400 }
  }

  return { ok: true, enabled: record.enabled }
}
