import { createBrowserClient } from '@supabase/ssr'
import {
  getSafeSupabasePublicConfig,
  hasSupabasePublicEnv,
  getSupabaseMissingEnvMessage
} from './config'

let warned = false

export const createClient = () => {
  const { url, key } = getSafeSupabasePublicConfig()
  if (typeof window !== 'undefined' && !hasSupabasePublicEnv() && !warned) {
    warned = true
    console.warn(`[supabase] ${getSupabaseMissingEnvMessage()}`)
  }
  return createBrowserClient(url, key)
}
