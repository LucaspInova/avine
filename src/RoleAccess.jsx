import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { routeForProfile, useAuth } from './auth/AuthProvider.jsx'
import AvineLogin from './components/auth/AvineLogin.jsx'
import './RoleAccess.css'

function RoleEntry() {
  const navigate = useNavigate()
  const auth = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const {
    hasAccess,
    loading,
    profile,
    session,
    signOut,
  } = auth

  useEffect(() => {
    if (loading || !session) return

    if (!hasAccess) {
      void signOut()
      return
    }

    navigate(routeForProfile(profile), { replace: true })
  }, [
    hasAccess,
    loading,
    navigate,
    profile,
    session,
    signOut,
  ])

  async function handleLogin({ email, password, keepSession }) {
    setBusy(true)
    setError('')

    const result = await auth.signIn({ email, password, keepSession })

    if (result.error) {
      setError('E-mail ou senha inválidos.')
      setBusy(false)
      return
    }

    if (
      !result.profile ||
      result.profile.ativo !== true ||
      result.profile.acesso_habilitado !== true
    ) {
      await auth.signOut()
      setError('Usuário sem perfil ativo associado.')
      setBusy(false)
      return
    }

    navigate(routeForProfile(result.profile), { replace: true })
    setBusy(false)
  }

  if (auth.loading && !busy) {
    return (
      <main className="role-login-shell">
        <p className="role-login-loading">Validando sessão...</p>
      </main>
    )
  }

  return (
    <AvineLogin
      error={error || auth.error}
      busy={busy}
      onSubmit={handleLogin}
    />
  )
}

function RoleAccessScreen() {
  const { role: requestedRole } = useParams()
  const auth = useAuth()

  if (auth.loading) {
    return <main className="role-access-screen" aria-busy="true" />
  }

  if (!auth.session || !auth.hasAccess) {
    return <Navigate to="/" replace />
  }

  if (auth.profile.perfil === 'Gerencial') {
    return <Navigate to="/gerencial" replace />
  }

  if (requestedRole && requestedRole !== auth.profile.perfil.toLowerCase()) {
    return <Navigate to={routeForProfile(auth.profile)} replace />
  }

  return (
    <main className="role-access-screen">
      <p className="role-access-message">
        Seu usuário está associado à role <strong>{auth.profile.perfil}</strong>.
      </p>
    </main>
  )
}

export { RoleAccessScreen, RoleEntry }
