import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../domains/fstd/components/PromotorWorkspace.jsx', () => ({
  PromotorWorkspace: ({ navigation, profile }) => {
    const saved = navigation.read(profile.id)
    return (
      <>
        <output data-testid="workspace-route">{JSON.stringify(saved.route)}</output>
        <button
          type="button"
          onClick={() => navigation.save(profile.id, {
            selectedStoreId: 'loja 1',
            fstdTargetKey: '10:42',
          })}
        >
          Abrir FSTD
        </button>
      </>
    )
  },
  StoreDetailScreen: () => null,
  StoresScreen: () => null,
}))

vi.mock('./features/shell/PromotorApplicationShell.jsx', () => ({
  PromotorApplicationShell: ({ children }) => children({
    profile: { id: 'promotor-1', perfil: 'Promotor' },
    onLogout: vi.fn(),
  }),
}))

import { PromotorWorkspaceAdapter } from './PromotorApp.jsx'

function LocationSnapshot() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderAdapter(pathname) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <PromotorWorkspaceAdapter
        profile={{ id: 'promotor-1', perfil: 'Promotor' }}
        onLogout={vi.fn()}
      />
      <LocationSnapshot />
    </MemoryRouter>,
  )
}

describe('PromotorWorkspaceAdapter — URL como fonte de navegação', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('hidrata uma etapa profunda diretamente pela URL', () => {
    renderAdapter('/acesso/promotor/lojas/loja-1/notas/10%3A42/fstd')

    expect(screen.getByTestId('workspace-route')).toHaveTextContent(JSON.stringify({
      view: 'fstd',
      storeId: 'loja-1',
      invoiceKey: '10:42',
    }))
  })

  it('reflete transições do workspace no histórico do navegador', async () => {
    renderAdapter('/acesso/promotor/lojas')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir FSTD' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(
      '/acesso/promotor/lojas/loja%201/notas/10%3A42/fstd',
    ))
  })

  it('normaliza endereço desconhecido para a lista de lojas', async () => {
    renderAdapter('/acesso/promotor/endereco-inexistente')

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/acesso/promotor/lojas'))
  })
})
