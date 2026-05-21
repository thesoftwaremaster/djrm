import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../supabase'
import { AuthContext } from './AuthContext'
import { isDemoUser } from '../utils/demoMode'

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (!isMounted) return

      if (error) {
        console.error(error)
        setSession(null)
        setUser(null)
      } else {
        setSession(data.session)
        setUser(data.session?.user || null)
      }

      setLoading(false)
    }

    void loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user || null)
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async ({ email, password }) => {
    return supabase.auth.signInWithPassword({ email, password })
  }, [])

  const signOut = useCallback(async () => {
    return supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      isAuthenticated: Boolean(session),
      signIn,
      signOut,
      isDemoMode: isDemoUser(user),
    }),
    [loading, session, signIn, signOut, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
