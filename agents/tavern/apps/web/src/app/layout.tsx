import type { Metadata, Viewport } from 'next'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'

import { Toaster } from '@mindworld/ui/components/sonner'
import { cn } from '@mindworld/ui/lib/utils'

import { TRPCReactProvider } from '~/trpc/react'
import { ThemeProvider, ThemeSwitcher } from '@/components/theme'

import '~/globals.css'

import { env } from '~/env'

export const metadata: Metadata = {
  metadataBase: new URL(
    env.VERCEL_ENV === 'production' ? 'https://turbo.t3.gg' : 'http://localhost:3000',
  ),
  title: 'Create T3 Turbo',
  description: 'Simple monorepo with shared backend for web & mobile apps',
  openGraph: {
    title: 'Create T3 Turbo',
    description: 'Simple monorepo with shared backend for web & mobile apps',
    url: 'https://create-t3-turbo.vercel.app',
    siteName: 'Create T3 Turbo',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@jullerino',
    creator: '@jullerino',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'min-h-screen bg-background font-sans text-foreground antialiased',
          GeistSans.variable,
          GeistMono.variable,
        )}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TRPCReactProvider>{props.children}</TRPCReactProvider>
          <div className="absolute bottom-4 right-4">
            <ThemeSwitcher />
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
