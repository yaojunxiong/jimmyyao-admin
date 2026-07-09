'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/study', label: 'Study Management', icon: '📚' },
  { href: '/forum', label: 'Forum Management', icon: '💬' },
  { href: '/users', label: 'Users', icon: '👥' },
  { href: '/workflows', label: 'Workflows', icon: '⚡' },
  { href: '/visitors', label: 'Visitors', icon: '👣' },
  { href: '/system', label: 'System Settings', icon: '⚙️' },
  { href: '/logs', label: 'Logs', icon: '📋' },
]

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <h1>Admin Center</h1>
          <p>jimmyyao.com</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <span className="sidebar-link-icon">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
