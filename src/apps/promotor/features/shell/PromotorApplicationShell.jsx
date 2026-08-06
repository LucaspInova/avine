import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../../domains/auth/AuthProvider.jsx'
import { clearPromotorNavigation } from '../../navigationState'

export function PromotorApplicationShell({ children }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session, profile, loading, signOut } = useAuth()
  const isAllowed = profile?.perfil === 'Promotor'
    && profile?.ativo
    && profile?.acesso_habilitado

  async function handleLogout() {
    if (profile?.id) clearPromotorNavigation(profile.id)
    await signOut()
    queryClient.clear()
    navigate('/', { replace: true })
  }

  if (loading) {
    return (
      <main className="promotor-loading" aria-busy="true">
        <span>Carregando FSTD Digital...</span>
      </main>
    )
  }

  if (!session || !isAllowed) return <Navigate to="/" replace />

  return children({ profile, onLogout: handleLogout })
}
