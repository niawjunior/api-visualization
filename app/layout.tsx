import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeProvider } from './components/ThemeProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'API Visualization',
  description: 'Project Visualization Tool',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={cn(inter.className, "bg-background text-foreground antialiased h-screen w-screen overflow-hidden flex flex-col")}>
        <ThemeProvider>
          <div className="titlebar" />
          <div className="flex-1 overflow-hidden pt-10">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}


