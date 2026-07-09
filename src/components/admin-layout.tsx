'use client'

import { useState } from 'react'
import Sidebar from './sidebar'
import Topbar from './topbar'

type AdminLayoutProps = {
  children: React.ReactNode
  userEmail?: string
  role?: string
}

export default function AdminLayout({ children, userEmail, role }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="admin-layout">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-area">
        <Topbar
          userEmail={userEmail}
          role={role}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        />
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  )
}
