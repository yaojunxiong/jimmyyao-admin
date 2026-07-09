'use client'

type TopbarProps = {
  userEmail?: string
  role?: string
  onMenuClick: () => void
}

export default function Topbar({ userEmail, role, onMenuClick }: TopbarProps) {
  const handleLogout = async () => {
    window.location.assign('https://www.jimmyyao.com/logout?next=https%3A%2F%2Fadmin.jimmyyao.com%2Fdashboard')
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
