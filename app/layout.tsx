import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'ClearMetrics — Privacy-First Web Analytics with AI Insights',
  description:
    'ClearMetrics gives you beautiful, cookieless analytics and AI-powered insights — without compromising your visitors\' privacy. GDPR compliant, under 1KB script.',
  keywords: ['web analytics', 'privacy analytics', 'GDPR analytics', 'cookieless analytics', 'AI insights'],
  authors: [{ name: 'ClearMetrics' }],
  openGraph: {
    title: 'ClearMetrics — Privacy-First Web Analytics',
    description: 'Beautiful, cookieless analytics with AI-powered insights.',
    type: 'website',
    url: 'https://clearmetrics.io',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ClearMetrics — Privacy-First Web Analytics',
    description: 'Beautiful, cookieless analytics with AI-powered insights.',
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
