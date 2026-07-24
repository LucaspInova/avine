/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Navigate } from 'react-router-dom'
import { setAuthPersistence, supabase } from '../lib/supabaseClient'

const profileSelect =
  'id, auth_user_id, email, nome, perfil, estado, fotos_habilitadas, foto_url, ativo, acesso_habilitado, created_at'

const AuthContext = createContext(null)

function routeForProfile(profile) {
  if (profile?.perfil === 'Gerencial') return '/gerencial'
  if (profile?.perfil === 'Promotor') return '/acesso/promotor'
  if (profile?.perfil === 'Entregador') return '/acesso/entregador'
  return '/'
}

function hasApplicationAccess(profile) {
  return Boolean(
    profile &&
      profile.ativo === true &&
      profile.acesso_habilitado === true &&
      profile.auth_user_id,
  )
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestVersion = useRef(0)

  const resolveProfile = useCallback(async (activeSession) => {
    const version = ++requestVersion.current
    const userId = activeSession?.user?.id

    if (!userId) {
      setSession(null)
      setProfile(null)
      setError('')
      setLoading(false)
      return null
    }

    setLoading(true)
    const { data, error: profileError } = await supabase
      .from('usuarios')
      .select(profileSelect)
      .eq('auth_user_id', userId)
      .maybeSingle()

    if (version !== requestVersion.current) return data

    if (profileError) {
      setSession(activeSession)
      setProfile(null)
      setError(profileError.message)
      setLoading(false)
      return null
    }

    setSession(activeSession)
    setProfile(data)
    setError('')
    setLoading(false)
    return data
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!mounted) return
        if (sessionError) throw sessionError
        return resolveProfile(data.session)
      })
      .catch((sessionError) => {
        if (!mounted) return
        setError(sessionError.message)
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      // Keep the Auth callback synchronous; resolve database state afterwards.
      window.setTimeout(() => {
        if (mounted) void resolveProfile(nextSession)
      }, 0)
    })

    return () => {
      mounted = false
      requestVersion.current += 1
      subscription.unsubscribe()
    }
  }, [resolveProfile])

  const signIn = useCallback(
    async ({ email, password, keepSession = true }) => {
      setAuthPersistence(keepSession)
      setLoading(true)
      setError('')

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setLoading(false)
        return { session: null, profile: null, error: signInError }
      }

      const nextProfile = await resolveProfile(data.session)
      return { session: data.session, profile: nextProfile, error: null }
    },
    [resolveProfile],
  )

  const signOut = useCallback(async () => {
    requestVersion.current += 1
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setError('')
    setLoading(false)
  }, [])

  const refreshProfile = useCallback(
    () => resolveProfile(session),
    [resolveProfile, session],
  )

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      error,
      hasAccess: hasApplicationAccess(profile),
      signIn,
      signOut,
      refreshProfile,
    }),
    [error, loading, profile, refreshProfile, session, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  return context
}

export function RequireRole({ profile: requiredProfile, children }) {
  const auth = useAuth()

  if (auth.loading) {
    return <main className="route-loading" aria-busy="true">Carregando...</main>
  }

  if (!auth.session || !auth.hasAccess) {
    return <Navigate to="/" replace />
  }

  if (auth.profile.perfil !== requiredProfile) {
    return <Navigate to={routeForProfile(auth.profile)} replace />
  }

  return children
}

export { hasApplicationAccess, routeForProfile }
