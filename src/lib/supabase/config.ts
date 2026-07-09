const SUPABASE_FALLBACK_URL = 'https://missing-supabase-config.local'
const SUPABASE_FALLBACK_KEY = 'sb_anon_missing_config'

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
