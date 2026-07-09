import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import {
  getSafeSupabasePublicConfig,
  hasSupabasePublicEnv
} from './config'

export const createClient = async (request: NextRequest) => {
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers }
  })

  if (!hasSupabasePublicEnv()) {
    return supabaseResponse
  }

  const { url, key } = getSafeSupabasePublicConfig()

  const supabase = createServerClient(url, key, {
    cookieOptions: {
      domain: process.env.NODE_ENV === 'production' ? '.jimmyyao.com' : undefined,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, {
            ...options,
            domain: process.env.NODE_ENV === 'production' ? '.jimmyyao.com' : undefined,
            path: options.path || '/',
            sameSite: options.sameSite || 'lax',
            secure: process.env.NODE_ENV === 'production'
          })
        )
      }
    }
  })

  await supabase.auth.getUser()

  return supabaseResponse
}
