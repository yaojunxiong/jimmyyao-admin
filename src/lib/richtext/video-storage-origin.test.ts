import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PRODUCTION_SUPABASE_PROJECT_ORIGIN,
  getConfiguredSupabaseProjectOrigin,
  normalizeSupabaseProjectOrigin,
} from '@/lib/supabase/config'

const ALTERNATE_ORIGIN = 'https://abcdefghijklmnopqrst.supabase.co'

function withConfiguredOrigin(
  value: string | undefined,
  vercelEnv: string | undefined,
  callback: () => void,
) {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const previousVercelEnv = process.env.VERCEL_ENV
  try {
    if (value === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = value
    if (vercelEnv === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = vercelEnv
    callback()
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = previousVercelEnv
  }
}

describe('canonical Supabase project origin', () => {
  it('accepts the production and alternate hosted project origins', () => {
    assert.equal(
      normalizeSupabaseProjectOrigin(PRODUCTION_SUPABASE_PROJECT_ORIGIN),
      PRODUCTION_SUPABASE_PROJECT_ORIGIN,
    )
    assert.equal(
      normalizeSupabaseProjectOrigin(`${ALTERNATE_ORIGIN}/`),
      ALTERNATE_ORIGIN,
    )
  })

  it('rejects missing, malformed, HTTP, attacker, and lookalike hosts', () => {
    for (const value of [
      undefined,
      '',
      'not a URL',
      'http://abcdefghijklmnopqrst.supabase.co',
      'https://attacker.example',
      'https://abcdefghijklmnopqrst.supabase.co.evil.example',
      'https://short.supabase.co',
    ]) {
      assert.equal(normalizeSupabaseProjectOrigin(value), null, String(value))
    }
  })

  it('rejects credentials, non-default ports, paths, queries, and fragments', () => {
    for (const value of [
      'https://user:pass@abcdefghijklmnopqrst.supabase.co',
      'https://abcdefghijklmnopqrst.supabase.co:443',
      'https://abcdefghijklmnopqrst.supabase.co:444',
      'https://abcdefghijklmnopqrst.supabase.co/storage/v1',
      'https://abcdefghijklmnopqrst.supabase.co?project=other',
      'https://abcdefghijklmnopqrst.supabase.co#other',
      ` ${ALTERNATE_ORIGIN}`,
    ]) {
      assert.equal(normalizeSupabaseProjectOrigin(value), null, value)
    }
  })

  it('fails closed when configuration is missing', () => {
    withConfiguredOrigin(undefined, undefined, () => {
      assert.equal(getConfiguredSupabaseProjectOrigin(), null)
    })
  })

  it('allows alternate Preview configuration but pins Vercel Production', () => {
    withConfiguredOrigin(ALTERNATE_ORIGIN, 'preview', () => {
      assert.equal(getConfiguredSupabaseProjectOrigin(), ALTERNATE_ORIGIN)
    })
    withConfiguredOrigin(ALTERNATE_ORIGIN, 'production', () => {
      assert.equal(getConfiguredSupabaseProjectOrigin(), null)
    })
    withConfiguredOrigin(PRODUCTION_SUPABASE_PROJECT_ORIGIN, 'production', () => {
      assert.equal(
        getConfiguredSupabaseProjectOrigin(),
        PRODUCTION_SUPABASE_PROJECT_ORIGIN,
      )
    })
  })
})
