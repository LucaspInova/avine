import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CadastroLojaModal, InformacoesUsuarioModal, LojasScreen, UsuariosScreen } from './GerencialApp.jsx'

const noop = vi.fn()
const storeProps = {
  search: '', lojas: [], promotores: [], vinculos: {}, loading: false, error: '', savingKey: '',
  isFilterOpen: false, selectedUfs: [], selectedCidades: [], onSearch: noop, onToggleFilter: noop,
  onToggleUf: noop, onToggleCidade: noop, onClearFilters: noop, onCloseFilters: noop,
  onOpenCadastro: noop, onChangePromotor: noop, canCreateStore: false,
}
const userProps = {
  currentUser: { id: 'admin', perfil: 'Admin' }, usuarios: [], loading: false, error: '', busy: false,
  editId: '', editForm: {}, search: '', onSearch: noop, onOpenCadastro: noop, onOpenUsuario: noop,
  onEditChange: noop, onStartEdit: noop, onCancelEdit: noop, onSaveEdit: noop, onDelete: noop,
}

describe('fluxos proprietários de lojas/roteirização', () => {
  it('distingue carregamento, erro e vazio sem liberar cadastro ao perfil sem permissão', () => {
    const { rerender } = render(<LojasScreen {...storeProps} loading />)
    expect(screen.getByText('Carregando lojas...')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Cadastrar Loja/ })).not.toBeInTheDocument()
    rerender(<LojasScreen {...storeProps} error="API de lojas indisponível" />)
    expect(screen.getByText('API de lojas indisponível')).toBeVisible()
    expect(screen.getByText('Nenhuma loja encontrada.')).toBeVisible()
  })

  it('pagina as lojas e preserva o contrato de vinculação do promotor', () => {
    const stores = Array.from({ length: 25 }, (_, index) => ({ id: `l${index}`, codigo: `${index}`, nome: `Loja ${index}`, cidade: 'Fortaleza', uf: 'CE' }))
    const onChangePromotor = vi.fn()
    render(<LojasScreen {...storeProps} lojas={stores} promotores={[{ id: 'p1', nome: 'Paula', perfil: 'Promotor', estado: 'CE' }]} onChangePromotor={onChangePromotor} />)
    expect(screen.getByText('0 - Loja 0')).toBeVisible()
    expect(screen.queryByText('24 - Loja 24')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(screen.getByText('24 - Loja 24')).toBeVisible()
    fireEvent.click(screen.getAllByRole('button', { name: 'Promotor da loja' })[0])
    fireEvent.click(screen.getByRole('option', { name: 'Paula' }))
    expect(onChangePromotor).toHaveBeenCalledWith('l24', 1, 'p1')
  })

  it('abre/fecha o modal proprietário e só confirma cadastro válido', () => {
    const onClose = vi.fn(); const onSubmit = vi.fn()
    const { rerender } = render(<CadastroLojaModal form={{ codigo: '', nome: '', uf: '', cidade: '' }} lojas={[]} busy={false} error="" onChange={noop} onClose={onClose} onSubmit={onSubmit} />)
    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar cadastro' })); expect(onClose).toHaveBeenCalledOnce()
    rerender(<CadastroLojaModal form={{ codigo: '10', nome: 'Loja Centro', uf: 'CE', cidade: 'Fortaleza' }} lojas={[]} busy={false} error="" onChange={noop} onClose={onClose} onSubmit={onSubmit} />)
    fireEvent.submit(screen.getByRole('button', { name: 'Cadastrar' }).closest('form'))
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})

describe('fluxo proprietário de usuários', () => {
  it('expõe carregamento, erro e vazio como estados mutuamente verificáveis', () => {
    const { rerender } = render(<UsuariosScreen {...userProps} loading />)
    expect(screen.getByText('Carregando usuários...')).toBeVisible()
    rerender(<UsuariosScreen {...userProps} error="Falha ao carregar usuários" />)
    expect(screen.getByText('Falha ao carregar usuários')).toBeVisible()
    expect(within(screen.getByRole('table', { name: 'Cadastro de Usuários' })).getByText('Nenhum usuário encontrado.')).toBeVisible()
  })

  it('confirma ações sensíveis somente pelo modal e respeita canManage', () => {
    const user = { nome: 'Paula', email: 'p@a.com', perfil: 'Promotor', estado: 'CE', fotos_habilitadas: false }
    const onClose = vi.fn()
    const { rerender } = render(<InformacoesUsuarioModal usuario={user} onClose={onClose} onEdit={noop} canManage={false} />)
    expect(screen.getByRole('button', { name: 'Paula p@a.com' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Fotos habilitadas' })).not.toBeInTheDocument()
    rerender(<InformacoesUsuarioModal usuario={user} onClose={onClose} onEdit={noop} canManage />)
    expect(screen.queryByRole('button', { name: 'Fotos habilitadas' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar informações' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
