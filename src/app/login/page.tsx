import { redirect } from 'next/navigation'

const AUTH_ORIGIN = 'https://www.jimmyyao.com'

export default function LoginPage() {
  const url = new URL('/login', AUTH_ORIGIN)
  url.searchParams.set('next', 'https://admin.jimmyyao.com/dashboard')
  redirect(url.toString())
}
