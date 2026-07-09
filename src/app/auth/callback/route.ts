import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSafeSupabasePublicConfig } from '@/lib/supabase/config'

function getSafeNextPath(input: string | null) {
  const raw = String(input || '').trim()
  if (!raw) return '/dashboard'
  if (!raw.startsWith('/')) return '/dashboard'
  if (raw.startsWith('//')) return '/dashboard'
  return raw
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin
  const next = getSafeNextPath(requestUrl.searchParams.get('next'))

  let response = NextResponse.redirect(new URL(next, origin))

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
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.redirect(new URL(next, origin))
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            ...options,
            domain: process.env.NODE_ENV === 'production' ? '.jimmyyao.com' : undefined,
            path: options.path || '/',
            sameSite: options.sameSite || 'lax',
            secure: process.env.NODE_ENV === 'production'
          })
        })
      }
    }
  })

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  }

  return response
}
