'use client'

import { useState, type FormEvent } from 'react'
import { useAuth } from '@/contexts/AuthContext'

function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/85 p-8 shadow-2xl shadow-slate-900/10 backdrop-blur">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-orange-600">
          Torqq
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          {title}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function FormField({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <input
        {...props}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
      />
    </label>
  )
}

function LoginForm({ onToggleMode }: { onToggleMode: () => void }) {
  const { login, isLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to continue using the social media workflow."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Don&apos;t have an account?{' '}
        <button
          type="button"
          onClick={onToggleMode}
          className="font-medium text-orange-600 transition hover:text-orange-700"
        >
          Create one
        </button>
      </p>
    </AuthCard>
  )
}

function SignupForm({ onToggleMode }: { onToggleMode: () => void }) {
  const { signup, isLoading } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    try {
      const result = await signup(email, password, name)
      if (result.needsEmailConfirmation) {
        setSuccess('Account created. Check your email to confirm your account.')
        onToggleMode()
        return
      }
      setSuccess('Account created successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed.')
    }
  }

  return (
    <AuthCard
      title="Create account"
      subtitle="Use the same Supabase-backed authentication flow as Marqq."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormField
          label="Full name"
          autoComplete="name"
          placeholder="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <FormField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? 'Creating account...' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onToggleMode}
          className="font-medium text-orange-600 transition hover:text-orange-700"
        >
          Sign in
        </button>
      </p>
    </AuthCard>
  )
}

export function AuthScreen() {
  const [isSignup, setIsSignup] = useState(false)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_26%),linear-gradient(180deg,#f8fafc,#fff7ed)] px-4 py-10">
      {isSignup ? (
        <SignupForm onToggleMode={() => setIsSignup(false)} />
      ) : (
        <LoginForm onToggleMode={() => setIsSignup(true)} />
      )}
    </div>
  )
}
