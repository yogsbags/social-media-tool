'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { AuthState, User } from '../types/auth'

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>
  signup: (
    email: string,
    password: string,
    name: string
  ) => Promise<{ needsEmailConfirmation: boolean }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function missingSupabaseEnvError() {
  return new Error(
    'Supabase auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  )
}

function mapSupabaseUser(supabaseUser: any): User | null {
  if (!supabaseUser) return null

  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    name:
      supabaseUser.user_metadata?.full_name ||
      supabaseUser.user_metadata?.name ||
      supabaseUser.email?.split('@')[0] ||
      'User',
    avatar:
      supabaseUser.user_metadata?.avatar_url ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${supabaseUser.email}`,
    role:
      (supabaseUser.user_metadata?.role as 'admin' | 'user' | 'manager') ||
      'user',
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  })

  useEffect(() => {
    let mounted = true

    if (!supabase) {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
      return () => {
        mounted = false
      }
    }

    const client = supabase

    const checkSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await client.auth.getSession()

        if (!mounted) return

        if (error) {
          console.error('Error getting session:', error)
          setState((prev) => ({ ...prev, isLoading: false }))
          return
        }

        if (session?.user) {
          setState({
            user: mapSupabaseUser(session.user),
            isAuthenticated: true,
            isLoading: false,
          })
        } else {
          setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          })
        }
      } catch (error) {
        if (!mounted) return
        console.error('Error checking session:', error)
        setState((prev) => ({ ...prev, isLoading: false }))
      }
    }

    checkSession()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return

      if (session?.user) {
        setState({
          user: mapSupabaseUser(session.user),
          isAuthenticated: true,
          isLoading: false,
        })
      } else {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        })
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    if (!supabase) throw missingSupabaseEnvError()
    const client = supabase
    setState((prev) => ({ ...prev, isLoading: true }))

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error
      if (!data.user) throw new Error('No user data returned')

      setState({
        user: mapSupabaseUser(data.user),
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }))
      const authError = error as AuthError
      throw new Error(
        authError.message || 'Login failed. Please check your credentials.'
      )
    }
  }, [])

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      if (!supabase) throw missingSupabaseEnvError()
      const client = supabase
      setState((prev) => ({ ...prev, isLoading: true }))

      try {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              name,
              role: 'user',
            },
          },
        })

        if (error) throw error

        if (data.session?.user) {
          setState({
            user: mapSupabaseUser(data.session.user),
            isAuthenticated: true,
            isLoading: false,
          })
          return { needsEmailConfirmation: false }
        }

        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        })
        return { needsEmailConfirmation: true }
      } catch (error) {
        setState((prev) => ({ ...prev, isLoading: false }))
        const authError = error as AuthError
        throw new Error(authError.message || 'Signup failed. Please try again.')
      }
    },
    []
  )

  const logout = useCallback(async () => {
    if (!supabase) {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
      return
    }
    const client = supabase
    setState((prev) => ({ ...prev, isLoading: true }))

    try {
      const { error } = await client.auth.signOut()
      if (error) throw error
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  }, [])

  const value = useMemo(
    () => ({
      ...state,
      login,
      signup,
      logout,
    }),
    [login, logout, signup, state]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
