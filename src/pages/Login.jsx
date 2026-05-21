import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LockKeyhole, LogIn } from 'lucide-react'

import { useAuth } from '../auth/useAuth'

const Login = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const redirectTo = location.state?.from?.pathname || '/dashboard'

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }

    setIsSubmitting(true)

    const { error: signInError } = await signIn({
      email: email.trim(),
      password,
    })

    setIsSubmitting(false)

    if (signInError) {
      setError(signInError.message || 'Could not sign in.')
      return
    }

    navigate(redirectTo, { replace: true })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app px-4 text-sm text-text-secondary">
        Loading sign in...
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4 py-10 text-text-primary">
      <section className="w-full max-w-md rounded-2xl border border-border-soft bg-surface p-6 shadow-[0_16px_45px_rgba(17,24,39,0.08)] sm:p-8">
        <div className="mb-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-primary text-white shadow-[0_8px_20px_rgba(17,24,39,0.12)]">
            <LockKeyhole className="h-5 w-5" />
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
            DJ CRM
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
            Sign in
          </h1>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-[#344054]" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-12 w-full rounded-2xl border border-border-soft bg-surface px-4 text-base text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 sm:text-sm"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#344054]" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12 w-full rounded-2xl border border-border-soft bg-surface px-4 text-base text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 sm:text-sm"
              placeholder="Password"
            />
          </div>

          {error && (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white shadow-[0_8px_20px_rgba(17,24,39,0.12)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default Login
