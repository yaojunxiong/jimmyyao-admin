import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { formatTokyoDateTime } from '@/lib/date-format'

export const dynamic = 'force-dynamic'

type HealthCheck = {
  label: string
  table: string
  ok: boolean
  count: number | null
  latestAt: string | null
  error: string | null
}

type FreshnessItem = {
  label: string
  table: string
  latestAt: string | null
  error: string | null
}

const healthTables = [
  { label: 'Profiles', table: 'profiles', latestColumn: null },
  { label: 'User Roles', table: 'user_roles', latestColumn: null },
  { label: 'Visitor Activity Events', table: 'visitor_activity_events', latestColumn: 'created_at' },
  { label: 'Workflow Instances', table: 'workflow_instances', latestColumn: 'created_at' },
  { label: 'Forum Posts', table: 'forum_posts', latestColumn: 'created_at' },
  { label: 'Forum Comments', table: 'forum_comments', latestColumn: 'created_at' },
  { label: 'Membership Requests', table: 'membership_requests', latestColumn: 'created_at' },
  { label: 'Email Logs', table: 'email_logs', latestColumn: 'created_at' },
] as const

const freshnessTables = [
  { label: 'Latest visitor event', table: 'visitor_activity_events' },
  { label: 'Latest workflow instance', table: 'workflow_instances' },
  { label: 'Latest forum post', table: 'forum_posts' },
  { label: 'Latest forum comment', table: 'forum_comments' },
  { label: 'Latest membership request', table: 'membership_requests' },
  { label: 'Latest email log', table: 'email_logs' },
] as const

function maskPublicValue(value: string) {
  const text = value.trim()
  if (!text) return 'not configured'
  if (text.length <= 14) return `${text.slice(0, 4)}...`
  return `${text.slice(0, 8)}...${text.slice(-4)}`
}

function statusBadge(ok: boolean) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 800, background: ok ? '#dcfce7' : '#fee2e2', color: ok ? '#166534' : '#991b1b' }}>
      {ok ? 'OK' : 'Error'}
    </span>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="placeholder-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800 }}>{title}</h2>
      {description ? <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>{description}</p> : null}
      {children}
    </div>
  )
}

function InfoGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>{children}</div>
}

function InfoItem({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'warning' | 'success' }) {
  const color = tone === 'warning' ? '#92400e' : tone === 'success' ? '#166534' : '#0f172a'
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, minWidth: 0 }}>
      <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

async function checkTable(
  supabase: ReturnType<typeof createClient>,
  table: string,
  latestColumn: string | null
): Promise<HealthCheck> {
  let count: number | null = null
  let latestAt: string | null = null

  try {
    const { count: tableCount, error: countError } = await supabase.from(table).select('*', { count: 'exact', head: true })
    if (countError) throw countError
    count = tableCount || 0

    if (latestColumn) {
      const { data, error: latestError } = await supabase
        .from(table)
        .select(latestColumn)
        .order(latestColumn, { ascending: false })
        .limit(1)
        .maybeSingle()
      if (latestError) throw latestError
      latestAt = (data as Record<string, string | null> | null)?.[latestColumn] || null
    }

    return { label: table, table, ok: true, count, latestAt, error: null }
  } catch (e) {
    return { label: table, table, ok: false, count, latestAt, error: String(e instanceof Error ? e.message : e).slice(0, 220) }
  }
}

async function checkFreshness(supabase: ReturnType<typeof createClient>, table: string): Promise<FreshnessItem> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return { label: table, table, latestAt: (data as { created_at: string | null } | null)?.created_at || null, error: null }
  } catch (e) {
    return { label: table, table, latestAt: null, error: String(e instanceof Error ? e.message : e).slice(0, 220) }
  }
}

export default async function SystemSettingsPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const healthResults = await Promise.all(
    healthTables.map(async (item) => ({
      ...(await checkTable(supabase, item.table, item.latestColumn)),
      label: item.label,
    }))
  )

  const freshnessResults = await Promise.all(
    freshnessTables.map(async (item) => ({
      ...(await checkFreshness(supabase, item.table)),
      label: item.label,
    }))
  )

  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const supabaseAnonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || '').trim()
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const vercelEnv = process.env.VERCEL_ENV || 'not available'
  const gitCommit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'not available'
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || process.env.BUILD_TIME || 'not available'

  return (
    <>
      <div className="page-header">
        <h1>System Health</h1>
        <p>Read-only configuration checklist, Supabase health checks, and data freshness.</p>
      </div>

      <Section title="Environment" description="Sensitive values are never printed in full. This page only shows presence or masked public values.">
        <InfoGrid>
          <InfoItem label="NEXT_PUBLIC_SUPABASE_URL" value={supabaseUrl ? maskPublicValue(supabaseUrl) : 'not configured'} tone={supabaseUrl ? 'success' : 'warning'} />
          <InfoItem label="NEXT_PUBLIC_SUPABASE_ANON_KEY" value={supabaseAnonKey ? maskPublicValue(supabaseAnonKey) : 'not configured'} tone={supabaseAnonKey ? 'success' : 'warning'} />
          <InfoItem label="NEXT_PUBLIC_SITE_URL" value={siteUrl || 'not configured'} tone={siteUrl ? 'success' : 'warning'} />
          <InfoItem label="Admin authority" value="user_roles.role = admin" tone="success" />
          <InfoItem label="SUPABASE_SERVICE_ROLE_KEY" value={serviceRoleKey ? 'configured but not used by admin server client' : 'not configured'} tone={serviceRoleKey ? 'warning' : 'success'} />
        </InfoGrid>
      </Section>

      <Section title="Auth / Domain" description="Supabase Dashboard redirect URL settings cannot be read from this app. Treat this as a checklist, not confirmation.">
        <InfoGrid>
          <InfoItem label="Current Site URL" value="https://admin.jimmyyao.com" />
          <InfoItem label="Login Entry" value="https://www.jimmyyao.com/login" />
          <InfoItem label="Expected Cookie Domain" value=".jimmyyao.com" />
          <InfoItem label="Cookie Mode" value={process.env.NODE_ENV === 'production' ? 'production secure shared-domain cookies' : 'development local cookies'} />
        </InfoGrid>
        <div style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          {[
            'https://www.jimmyyao.com/auth/callback',
            'https://study.jimmyyao.com/auth/callback',
            'https://forum.jimmyyao.com/auth/callback',
            'https://admin.jimmyyao.com/auth/callback',
          ].map((url) => (
            <div key={url} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderTop: '1px solid #f1f5f9', fontSize: 13, overflowWrap: 'anywhere' }}>
              <span style={{ color: '#64748b', fontWeight: 800 }}>Required Redirect URL</span>
              <code>{url}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Supabase Health" description="Each row runs lightweight authenticated read-only queries through the normal server Supabase client.">
        <div style={{ display: 'grid', gap: 10 }}>
          {healthResults.map((item) => (
            <div key={item.table} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1.3fr) minmax(90px, 0.4fr) minmax(100px, 0.5fr) minmax(0, 1.3fr)', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, fontSize: 13 }}>
              <div style={{ minWidth: 0 }}><strong>{item.label}</strong><div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 11, overflowWrap: 'anywhere' }}>{item.table}</div></div>
              <div>{statusBadge(item.ok)}</div>
              <div><strong>Count:</strong> {item.count ?? '-'}</div>
              <div style={{ color: item.error ? '#dc2626' : '#64748b', overflowWrap: 'anywhere' }}>{item.error || (item.latestAt ? `Latest: ${formatTokyoDateTime(item.latestAt)}` : 'Latest: not checked')}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Data Freshness" description="Latest created_at timestamps shown in Tokyo time.">
        <InfoGrid>
          {freshnessResults.map((item) => (
            <InfoItem key={item.table} label={item.label} value={item.error ? `Error: ${item.error}` : item.latestAt ? formatTokyoDateTime(item.latestAt) : 'no data'} tone={item.error ? 'warning' : 'default'} />
          ))}
        </InfoGrid>
      </Section>

      <Section title="Deployment / App Info">
        <InfoGrid>
          <InfoItem label="App Name" value="jimmyyao-admin" />
          <InfoItem label="Current Environment" value={vercelEnv} />
          <InfoItem label="NODE_ENV" value={process.env.NODE_ENV || 'not available'} />
          <InfoItem label="Build Time" value={buildTime} />
          <InfoItem label="Git Commit" value={gitCommit === 'not available' ? gitCommit : maskPublicValue(gitCommit)} />
        </InfoGrid>
      </Section>
    </>
  )
}
