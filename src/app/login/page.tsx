import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import LoginForm from './login-form'

const AUTH_ORIGIN = 'https://www.jimmyyao.com'
const PRODUCTION_HOST = 'admin.jimmyyao.com'
const PREVIEW_HOST = 'admin-preview.jimmyyao.com'

export default async function LoginPage() {
  const headersList = await headers()
  const host = headersList.get('host') || ''
  const proto = headersList.get('x-forwarded-proto') || 'https'
  const origin = `${proto}://${host}`

  if (host === PRODUCTION_HOST) {
    const url = new URL('/login', AUTH_ORIGIN)
    url.searchParams.set('next', `${origin}/dashboard`)
    redirect(url.toString())
  }

  if (host === PREVIEW_HOST) {
    if (process.env.ENABLE_PREVIEW_PASSWORD_LOGIN === 'true') {
      return <LoginForm origin={origin} />
    }
    redirect('https://jimmyyao.com')
  }

  redirect('https://jimmyyao.com')
}
