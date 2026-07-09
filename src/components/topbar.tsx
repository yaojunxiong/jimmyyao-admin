'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type TopbarProps = {
  userEmail?: string
  role?: string
  onMenuClick: () => void
}

export default function Topbar({ userEmail, role, onMenuClick }: TopbarProps) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
  }

  return (
    <header className="topbar">
      <button className="mobile-menu-btn" onClick={onMenuClick}>
        ☰
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
        <span className="topbar-user">{userEmail || 'Unknown'}</span>
        {role && <span className="topbar-role">{role}</span>}
        <button className="topbar-logout" onClick={handleLogout}>
          Sign Out
        </button>
      </div>
    </header>
  )
}
