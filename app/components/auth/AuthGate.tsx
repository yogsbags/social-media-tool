'use client'

import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AuthScreen } from './AuthScreen'

export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-orange-400" />
          <p className="text-sm text-slate-300">Loading your session...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AuthScreen />
  }

  return <>{children}</>
}
