import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { checkAdminAccess } from '@/lib/admin-auth'
import AdminLayout from '@/components/admin-layout'

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const adminCheck = await checkAdminAccess(cookieStore)

  if (!adminCheck.userAuthed) {
    redirect('/login')
  }

  if (!adminCheck.isAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f1f5f9' }}>
        <div style={{ maxWidth: 480, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
            Access Denied
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 4px' }}>
            You do not have administrator access to this system.
          </p>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 20px' }}>
            Current role: {adminCheck.role}
          </p>
          <a
            href="https://study.jimmyyao.com"
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: '#3b82f6',
              color: '#ffffff',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Back to study.jimmyyao.com
          </a>
        </div>
      </div>
    )
  }

  return (
    <AdminLayout
      userEmail={adminCheck.userEmail}
      role={adminCheck.role}
    >
      {children}
    </AdminLayout>
  )
}
