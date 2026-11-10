import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Captured synchronously at module load â before Supabase processes the URL hash
const _hash = window.location.hash
const _hashType = new URLSearchParams(_hash.startsWith('#') ? _hash.slice(1) : '').get('type')
const _startsWithPasswordFlow = _hashType === 'invite' || _hashType === 'recovery'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,             setUser]             = useState(null)
  const [profile,          setProfile]          = useState(null)
  const [loading,          setLoading]          = useState(true)
  const [needsPasswordSet, setNeedsPasswordSet] = useState(_startsWithPasswordFlow)

  const loadProfile = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!error && data) setProfile(data)
    else setProfile(null)
  }, [])

  useEffect(() => {
    // Restore existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setNeedsPasswordSet(true)
      }
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  // Convenience role checks
  const role        = profile?.role ?? null
  const isSuperAdmin  = role === 'super_admin'
  const isOpsOrAbove  = role === 'super_admin' || role === 'ops_lead'
  const isAuthenticated = !!user

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      role,
      isSuperAdmin,
      isOpsOrAbove,
      isAuthenticated,
      needsPasswordSet,
      setNeedsPasswordSet,
      signIn,
      signOut,
      reloadProfile: () => user && loadProfile(user.id),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
