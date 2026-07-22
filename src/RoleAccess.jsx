import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { setAuthPersistence, supabase } from './lib/supabaseClient'
import AvineLogin from './components/auth/AvineLogin.jsx'
import './RoleAccess.css'

const profileSelect = 'id, auth_user_id, email, nome, perfil, ativo'

function rolePath(perfil) {
  return String(perfil ?? '').toLowerCase()
}

async function getAuthenticatedProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw userError
  if (!user) return null

  const { data, error } = await supabase
    .from('usuarios')
    .select(profileSelect)
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (error) throw error
  return data
}

function RoleEntry() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function redirectByRole() {
    const profile = await getAuthenticatedProfile()

    if (!profile || profile.ativo !== true) {
      await supabase.auth.signOut()
      setError('Usuário sem perfil ativo associado.')
      return
    }

    const destination =
      profile.perfil === 'Gerencial'
        ? '/gerencial'
        : `/acesso/${rolePath(profile.perfil)}`

    navigate(destination, { replace: true })
  }

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (data.session) await redirectByRole()
      } catch (bootstrapError) {
        if (mounted) setError(bootstrapError.message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    bootstrap()

    return () => {
      mounted = false
    }
    // The entry screen only bootstraps the current session once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogin({ email, password, keepSession }) {
    setBusy(true)
    setError('')
    setAuthPersistence(keepSession)

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (loginError) {
      setError('E-mail ou senha inválidos.')
      setBusy(false)
      return
    }

    try {
      await redirectByRole(data.session)
    } catch (profileError) {
      await supabase.auth.signOut()
      setError(profileError.message || 'Não foi possível identificar o perfil do usuário.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <main className="role-login-shell">
        <p className="role-login-loading">Validando sessão...</p>
      </main>
    )
  }

  return <AvineLogin error={error} busy={busy} onSubmit={handleLogin} />
}

function RoleAccessScreen() {
  const navigate = useNavigate()
  const { role: requestedRole } = useParams()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        if (!data.session) {
          navigate('/', { replace: true })
          return
        }

        const currentProfile = await getAuthenticatedProfile()

        if (!currentProfile || currentProfile.ativo !== true) {
          await supabase.auth.signOut()
          if (mounted) navigate('/', { replace: true })
          return
        }

        if (currentProfile.perfil === 'Gerencial') {
          navigate('/gerencial', { replace: true })
          return
        }

        if (mounted) setProfile(currentProfile)
      } catch (profileError) {
        if (mounted) setError(profileError.message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadProfile()

    return () => {
      mounted = false
    }
  }, [navigate, requestedRole])

  if (loading) {
    return <main className="role-access-screen" aria-busy="true" />
  }

  if (error) {
    return (
      <main className="role-access-screen">
        <p className="role-access-message">Não foi possível carregar sua role.</p>
      </main>
    )
  }

  if (!profile) return <Navigate to="/" replace />

  return (
    <main className="role-access-screen">
      <p className="role-access-message">
        Seu usuário está associado à role <strong>{profile.perfil}</strong>.
      </p>
    </main>
  )
}

export { RoleAccessScreen, RoleEntry }
