import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LegacyFstdScreen, StoreDetailScreen, StoresScreen } from './PromotorWorkspace.jsx'

const noop = vi.fn()
const storesProps = {
  stores: [], nfds: [], loading: false, search: '', onSearch: noop, onMenu: noop,
  onCloseProfileMenu: noop, onLogout: noop, onUploadPhoto: noop, photoBusy: false,
  profile: { id: 'p1', nome: 'Paula', perfil: 'Promotor' }, profileMenuOpen: false,
  profilePhoto: '', onOpenStore: noop,
}

describe('telas proprietárias de lojas e notas do Promotor', () => {
  it('cobre carregamento, vazio, pesquisa e abertura da loja pelo contrato público', () => {
    const { rerender } = render(<StoresScreen {...storesProps} loading />)
    expect(screen.getByText('Carregando lojas...')).toBeVisible()
    rerender(<StoresScreen {...storesProps} />)
    expect(screen.getByText('Nenhuma loja vinculada ao seu usuário.')).toBeVisible()

    const onOpenStore = vi.fn()
    const store = { id: 'l1', nome: 'Loja Centro', codigo: '10', cidade: 'Fortaleza', uf: 'CE' }
    rerender(<StoresScreen {...storesProps} stores={[store]} nfds={[{ loja_id: 'l1', status_nfd: 'atrasada', visual_status: 'overdue' }]} onOpenStore={onOpenStore} />)
    expect(screen.getByText('1 Notas Pendentes')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Loja Centro/ }))
    expect(onOpenStore).toHaveBeenCalledWith(store)
  })

  it('restaura filtros de notas, abre nota/FSTD avulsa e volta à navegação anterior', () => {
    const onBack = vi.fn(); const onOpenNfd = vi.fn(); const onOpenAvulsa = vi.fn(); const onStatusFilter = vi.fn()
    const note = { id: 'n1', numero: '123', data_emissao: '2026-08-01', status_nfd: 'atrasada', visual_status: 'overdue', valor_total: 10 }
    render(<StoreDetailScreen store={{ nome: 'Loja Centro' }} nfds={[note]} statusFilter="atrasada" search="" onSearch={noop} onStatusFilter={onStatusFilter} onBack={onBack} onOpenNfd={onOpenNfd} onOpenAvulsa={onOpenAvulsa} />)
    fireEvent.click(screen.getByRole('button', { name: 'Finalizadas' }))
    expect(onStatusFilter).toHaveBeenCalledWith('finalizada')
    fireEvent.click(screen.getByRole('button', { name: /NFD: 123/ }))
    expect(onOpenNfd).toHaveBeenCalledWith(note)
    fireEvent.click(screen.getByRole('button', { name: '+ FSTD Avulsa' }))
    expect(onOpenAvulsa).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})

describe('integração do formulário FSTD com o contrato de domínio', () => {
  it('mostra erro da fronteira e não confirma uma mutação incompleta', () => {
    const onSubmit = vi.fn()
    render(<LegacyFstdScreen store={{ nome: 'Loja Centro' }} nfd={{ numero: '123' }} motivos={[]} busy={false} error="Falha ao salvar FSTD" onBack={noop} onSubmit={onSubmit} />)
    expect(screen.getByText('Falha ao salvar FSTD')).toBeVisible()
    const submit = screen.getByRole('button', { name: /Finalizar|Enviar|Salvar/ })
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
