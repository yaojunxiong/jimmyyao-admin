const SUPABASE_FALLBACK_URL = 'https://missing-supabase-config.local'
const SUPABASE_FALLBACK_KEY = 'sb_anon_missing_config'
const SUPABASE_PROJECT_ORIGIN_PATTERN =
  /^https:\/\/([a-z0-9]{20}\.supabase\.co)\/?$/
export const PRODUCTION_SUPABASE_PROJECT_ORIGIN =
  'https://ycjuceortcduakxscfes.supabase.co'

export function normalizeSupabaseProjectOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value !== value.trim()) return null
  const match = SUPABASE_PROJECT_ORIGIN_PATTERN.exec(value)
  return match ? `https://${match[1]}` : null
}

export function getConfiguredSupabaseProjectOrigin(): string | null {
  const origin = normalizeSupabaseProjectOrigin(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  )
  if (
    process.env.VERCEL_ENV === 'production'
    && origin !== PRODUCTION_SUPABASE_PROJECT_ORIGIN
  ) {
    return null
  }
  return origin
}

export function getSupabasePublicEnv() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const key = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  const missing: string[] = []
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!key) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return { url, key, missing, ready: missing.length === 0 }
}

export function hasSupabasePublicEnv() {
  return getSupabasePublicEnv().ready
}

export function getSupabaseMissingEnvMessage() {
  const info = getSupabasePublicEnv()
  if (info.ready) return ''
  return `Missing environment variables: ${info.missing.join(', ')}`
}

export function getSafeSupabasePublicConfig() {
  const info = getSupabasePublicEnv()
  if (info.ready) return { url: info.url, key: info.key }
  return { url: SUPABASE_FALLBACK_URL, key: SUPABASE_FALLBACK_KEY }
}
