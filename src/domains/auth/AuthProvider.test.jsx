import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, RequireRole } from './AuthProvider.jsx'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}))

const database = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('../../shared/lib/supabaseClient', () => ({
  setAuthPersistence: vi.fn(),
  supabase: {
    auth,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: database.maybeSingle })),
      })),
    })),
    rpc: database.rpc,
  },
}))

const validSession = {
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: 'auth-1',
    app_metadata: { role: 'promotor' },
  },
}

const validProfile = {
  id: 'profile-1',
  auth_user_id: 'auth-1',
  perfil: 'Promotor',
}

function ProtectedRoute() {
  return (
    <RequireRole profile="Promotor" authRole="promotor">
      <p>Área protegida</p>
    </RequireRole>
  )
}

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={['/protegida']}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<p>Tela de login</p>} />
          <Route path="/protegida" element={<ProtectedRoute />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    auth.getSession.mockReset()
    auth.getUser.mockReset()
    auth.onAuthStateChange.mockReset()
    auth.signOut.mockReset()
    database.maybeSingle.mockReset()
    database.rpc.mockReset()

    auth.getSession.mockResolvedValue({ data: { session: validSession }, error: null })
    auth.getUser.mockResolvedValue({ data: { user: validSession.user }, error: null })
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    auth.signOut.mockResolvedValue({ error: null })
    database.maybeSingle.mockResolvedValue({ data: validProfile, error: null })
    database.rpc.mockResolvedValue({ data: null, error: null })
  })

  it('redireciona para o login quando a sessão persistida não é mais válida no Auth', async () => {
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    })

    renderProtectedRoute()

    expect(await screen.findByText('Tela de login')).toBeVisible()
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(screen.queryByText('Área protegida')).not.toBeInTheDocument()
  })

  it('revalida ao voltar para a aplicação e bloqueia a rota se a sessão expirou', async () => {
    renderProtectedRoute()
    expect(await screen.findByText('Área protegida')).toBeVisible()

    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    })
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(screen.getByText('Tela de login')).toBeVisible())
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
