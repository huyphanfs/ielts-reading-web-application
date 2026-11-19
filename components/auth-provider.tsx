'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

const supabase = createClient()

type AuthContextValue = {
  user: User | null
  profile: Profile | null
  loading: boolean
  authError: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  clearAuthError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const loadProfile = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setUser(null)
      setProfile(null)
      setLoading(false)
      return
    }

    setUser(session.user)
    const { data } = await supabase
      .from('profiles')
      .select('id,email,full_name,avatar_url,role')
      .eq('id', session.user.id)
      .maybeSingle()

    setProfile((data as Profile | null) ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) void loadProfile(data.session)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) queueMicrotask(() => void loadProfile(session))
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null)
    const redirectTo =
      process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
      `${window.location.origin}/auth/callback`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) setAuthError('Unable to sign in with Google. Please try again later.')
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError('Unable to sign out. Please try again.')
    else {
      setUser(null)
      setProfile(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, profile, loading, authError, signInWithGoogle, signOut, clearAuthError: () => setAuthError(null) }),
    [user, profile, loading, authError, signInWithGoogle, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
