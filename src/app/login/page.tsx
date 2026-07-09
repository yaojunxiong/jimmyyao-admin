'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.push('/dashboard')
      } else {
        setChecking(false)
      }
    })
  }, [router, supabase])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: '#94a3b8' }}>Checking authentication...</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f1f5f9' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: 24 }}>
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: 32,
          border: '1px solid #e2e8f0',
        }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
            Admin Center
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748b' }}>
            Sign in with your jimmyyao.com account
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 14,
                  outline: 'none',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 14,
                  outline: 'none',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
              />
            </div>

            {error && (
              <p style={{ margin: 0, fontSize: 13, color: '#ef4444' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                background: loading ? '#93c5fd' : '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p style={{ margin: '16px 0 0', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
            Admin access requires a valid administrator account.
          </p>
        </div>
      </div>
    </div>
  )
}
