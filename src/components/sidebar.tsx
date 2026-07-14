'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/operations', label: 'Operations', icon: '✅' },
  {
    href: '/study',
    label: 'Study Management',
    icon: '📚',
    children: [
      { href: '/study', label: 'Dashboard' },
      { href: '/study/lessons', label: 'Lesson Audit' },
      { href: '/study/lessons/1', label: 'Lesson Detail' },
      { href: '/study/knowledge-base', label: 'Knowledge Base' },
      { href: '/study/recordings', label: 'Recordings' },
      { href: '/study/recording-health', label: 'Recording Health' },
      { href: '/study/checkins', label: 'Check-ins' },
      { href: '/study/recitation-videos', label: 'Recitation Videos' },
    ],
  },
  {
    href: '/forum',
    label: 'Forum Management',
    icon: '💬',
    children: [
      { href: '/forum', label: 'Posts' },
      { href: '/forum/create', label: 'Create Post' },
      { href: '/forum/comments', label: 'Comments' },
    ],
  },
  { href: '/users', label: 'Users', icon: '👥' },
  { href: '/workflows', label: 'Workflows', icon: '⚡' },
  { href: '/visitors', label: 'Visitors', icon: '👣' },
  { href: '/system', label: 'System Settings', icon: '⚙️' },
  { href: '/logs', label: 'Logs', icon: '📋' },
]

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()

  function isForumPostsActive() {
    return pathname === '/forum' || pathname.startsWith('/forum/posts/')
  }

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
            const childItems = 'children' in item ? item.children : undefined

            if (childItems) {
              return (
                <div key={item.href} className="sidebar-group">
                  <Link
                    href={item.href}
                    className={`sidebar-link ${isActive ? 'active' : ''}`}
                    onClick={onClose}
                  >
                    <span className="sidebar-link-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                  <div className="sidebar-subnav">
                    {childItems.map((child) => {
                      const childActive = child.href === '/forum'
                        ? isForumPostsActive()
                        : pathname === child.href || pathname.startsWith(child.href + '/')

                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`sidebar-sublink ${childActive ? 'active' : ''}`}
                          onClick={onClose}
                        >
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            }

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
