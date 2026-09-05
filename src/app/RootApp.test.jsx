import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../domains/auth/AuthProvider.jsx', () => ({
  RequireRole: ({ profile, authRole, children }) => (
    <section data-testid="guard" data-profile={profile} data-auth-role={authRole}>{children}</section>
  ),
}))
vi.mock('../domains/auth/RoleAccess.jsx', () => ({
  RoleEntry: () => <p>Entrada por perfil</p>,
  RoleAccessScreen: () => <p>Acesso ao perfil</p>,
}))
vi.mock('../shared/components/auth/PasswordRecovery.jsx', () => ({
  ForgotPasswordScreen: () => <p>Esqueci a senha</p>,
  ResetPasswordScreen: () => <p>Redefinir senha</p>,
}))
vi.mock('../apps/gerencial/routes.jsx', () => ({ default: () => <p>Aplicação gerencial</p> }))
vi.mock('../apps/promotor/routes.jsx', () => ({ default: () => <p>Aplicação promotor</p> }))

import RootApp from './RootApp.jsx'

function Location() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderRoute(path) {
  return render(<MemoryRouter initialEntries={[path]}><RootApp /><Location /></MemoryRouter>)
}

describe('RootApp — contrato de URLs e autorização', () => {
  beforeEach(() => { window.location.hash = '' })

  it.each([
    ['/', 'Entrada por perfil'],
    ['/esqueci-senha', 'Esqueci a senha'],
    ['/redefinir-senha', 'Redefinir senha'],
    ['/acesso/qualquer-perfil', 'Acesso ao perfil'],
  ])('serve a URL pública %s', async (path, content) => {
    renderRoute(path)
    expect(await screen.findByText(content)).toBeVisible()
  })

  it.each([
    ['/admin/usuarios', 'Admin', 'admin', 'Aplicação gerencial'],
    ['/gerencial/notas', 'Gerencial', 'gerencial', 'Aplicação gerencial'],
    ['/acesso/promotor/lojas', 'Promotor', 'promotor', 'Aplicação promotor'],
  ])('preserva a permissão da rota %s', async (path, profile, authRole, content) => {
    renderRoute(path)
    expect(await screen.findByText(content)).toBeVisible()
    expect(screen.getByTestId('guard')).toHaveAttribute('data-profile', profile)
    expect(screen.getByTestId('guard')).toHaveAttribute('data-auth-role', authRole)
  })

  it('restaura URLs legadas e desconhecidas com replace', async () => {
    const { unmount } = renderRoute('/promotor/lojas/loja-1/notas')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/acesso/promotor/lojas/loja-1/notas'))
    unmount()
    renderRoute('/url-inexistente')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'))
  })

  it('prioriza a restauração de senha indicada no hash da URL', () => {
    window.location.hash = '#type=recovery'
    renderRoute('/')
    expect(screen.getByText('Redefinir senha')).toBeVisible()
  })
})
