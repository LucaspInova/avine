import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applicationRoutes } from '../app/routePaths.js'
import { GerencialApplicationShell } from './gerencial/features/shell/GerencialApplicationShell.jsx'
import { PromotorApplicationShell } from './promotor/features/shell/PromotorApplicationShell.jsx'

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }))

vi.mock('../domains/auth/AuthProvider.jsx', () => ({ useAuth: auth.useAuth }))

function renderAt(element, initialEntry = '/area') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<p>Página de acesso</p>} />
        <Route path="/area" element={element} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('rotas e shells de aplicação', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    auth.useAuth.mockReset()
  })

  it('caracteriza as URLs públicas, protegidas e legada', () => {
    expect(applicationRoutes).toEqual({
      entry: '/',
      forgotPassword: '/esqueci-senha',
      resetPassword: '/redefinir-senha',
      admin: '/admin/*',
      gerencial: '/gerencial/*',
      promotor: '/acesso/promotor/*',
      roleAccess: '/acesso/:role',
      legacyPromotor: '/promotor/*',
    })
  })

  it('mantém os estados visual e de redirecionamento do shell gerencial', () => {
    const { rerender } = renderAt(
      <GerencialApplicationShell authLoading session={null} profile={null} sidebar={null}>
        conteúdo
      </GerencialApplicationShell>,
    )
    expect(screen.getByText('Validando sessão...')).toBeVisible()
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')

    rerender(
      <MemoryRouter initialEntries={['/area']}>
        <Routes>
          <Route path="/" element={<p>Página de acesso</p>} />
          <Route path="/area" element={<GerencialApplicationShell authLoading={false} session={null} profile={null}>conteúdo</GerencialApplicationShell>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Página de acesso')).toBeVisible()
  })

  it('compõe navegação e conteúdo gerencial para uma sessão válida', () => {
    renderAt(
      <GerencialApplicationShell
        authLoading={false}
        session={{ user: {} }}
        profile={{ perfil: 'Gerencial' }}
        sidebar={<nav aria-label="Menu principal"><button type="button">Notas</button></nav>}
      >
        <main><h1>Notas Fiscais de Devolução</h1></main>
      </GerencialApplicationShell>,
    )
    expect(screen.getByRole('heading', { name: 'Notas Fiscais de Devolução' })).toBeVisible()
    expect(within(screen.getByRole('navigation', { name: 'Menu principal' })).getByRole('button', { name: 'Notas' })).toBeVisible()
  })

  it('restringe o shell promotor por perfil e executa todas as ações de saída', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined)
    const clear = vi.spyOn(QueryClient.prototype, 'clear')
    auth.useAuth.mockReturnValue({
      session: { user: { id: 'auth-1' } },
      profile: { id: 'promotor-1', auth_user_id: 'auth-1', perfil: 'Promotor', ativo: false, acesso_habilitado: false },
      loading: false,
      signOut,
    })
    sessionStorage.setItem('fstd-promotor-navigation:promotor-1', '{"screen":"stores"}')

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/area']}>
          <Routes>
            <Route path="/" element={<p>Página de acesso</p>} />
            <Route path="/area" element={<PromotorApplicationShell>{({ profile, onLogout }) => <button onClick={onLogout}>Sair {profile.perfil}</button>}</PromotorApplicationShell>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sair Promotor' }))
    await waitFor(() => expect(screen.getByText('Página de acesso')).toBeVisible())
    expect(signOut).toHaveBeenCalledOnce()
    expect(clear).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('fstd-promotor-navigation:promotor-1')).toBeNull()
    clear.mockRestore()
  })
})
