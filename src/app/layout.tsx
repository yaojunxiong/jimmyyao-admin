import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Admin Center | jimmyyao.com',
  description: 'jimmyyao.com 统一后台管理中心',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
