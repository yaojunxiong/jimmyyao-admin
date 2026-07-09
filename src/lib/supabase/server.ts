import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSafeSupabasePublicConfig } from './config'

export const createClient = (
  cookieStore: Awaited<ReturnType<typeof cookies>>
) => {
  const { url, key } = getSafeSupabasePublicConfig()
  return createServerClient(url, key, {
    cookieOptions: {
      domain: process.env.NODE_ENV === 'production' ? '.jimmyyao.com' : undefined,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...options,
              domain: process.env.NODE_ENV === 'production' ? '.jimmyyao.com' : undefined,
              path: options.path || '/',
              sameSite: options.sameSite || 'lax',
              secure: process.env.NODE_ENV === 'production'
            })
          )
        } catch {
          // setAll from Server Component can be ignored when middleware refreshes sessions
        }
      }
    }
  })
}
