import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CadastroLojaModal, InformacoesUsuarioModal, LojasScreen, Sidebar, UsuariosScreen } from './GerencialApp.jsx'

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

describe('sidebar support', () => {
  it('directs users to WhatsApp in a new tab with a pre-filled message', () => {
    render(<Sidebar
      expanded
      canCollapse={false}
      selectedItem="dashboard"
      currentUser={{ nome: 'Lucas Paiva', perfil: 'Admin' }}
      profilePhoto=""
      onLogout={noop}
      onToggle={noop}
      onSelect={noop}
    />)

    const supportLink = screen.getByRole('link', { name: 'Suporte' })
    expect(supportLink).toHaveAttribute('href', 'https://wa.me/5585986532599?text=Ol%C3%A1!%20Preciso%20de%20suporte%20na%20plataforma%20Avine.')
    expect(supportLink).toHaveAttribute('target', '_blank')
    expect(supportLink).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

const filterStores = [
  { id: 'ce', codigo: '1', nome: 'Loja Ceará', cidade: 'Fortaleza', uf: 'CE' },
  { id: 'pe', codigo: '2', nome: 'Loja Pernambuco', cidade: 'Recife', uf: 'PE' },
]

function FilterableStores({ onApply = noop }) {
  const [isOpen, setIsOpen] = useState(false)
  const [ufs, setUfs] = useState([])
  const [cities, setCities] = useState([])
  const toggle = (setter) => (value) => setter((current) =>
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value])

  return <LojasScreen {...storeProps} lojas={filterStores} isFilterOpen={isOpen}
    selectedUfs={ufs} selectedCidades={cities} onToggleFilter={setIsOpen}
    onToggleUf={toggle(setUfs)} onToggleCidade={toggle(setCities)}
    onClearFilters={() => { setUfs([]); setCities([]) }} onCloseFilters={onApply} />
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

  it('usa seções verticais com drill-down, contadores, aplicação e limpeza', () => {
    const onApply = vi.fn()
    render(<FilterableStores onApply={onApply} />)
    const trigger = screen.getByRole('button', { name: /Filtrar/ })
    expect(trigger).toHaveTextContent('Filtrar')
    expect(within(trigger).getByLabelText('0 filtros ativos')).toHaveTextContent('0')
    fireEvent.click(trigger)

    const ufHeading = screen.getByRole('button', { name: /Filtrar por UF/ })
    const cityHeading = screen.getByRole('button', { name: /Filtrar por Cidade/ })
    expect(ufHeading.compareDocumentPosition(cityHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(ufHeading).toHaveAttribute('aria-expanded', 'false')
    expect(ufHeading.getAttribute('aria-controls')).toBe('store-filter-uf-options')
    expect(within(ufHeading).getByLabelText('0 selecionados')).toBeVisible()

    fireEvent.click(ufHeading)
    expect(ufHeading).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByLabelText('CE'))
    expect(within(ufHeading).getByLabelText('1 selecionado')).toHaveTextContent('1')
    expect(within(trigger).getByLabelText('1 filtro ativo')).toHaveTextContent('1')
    fireEvent.click(ufHeading)
    expect(ufHeading).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('CE')).not.toBeInTheDocument()
    fireEvent.click(ufHeading)
    expect(screen.getByLabelText('CE')).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar Filtros' }))
    expect(onApply).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    fireEvent.click(screen.getByRole('button', { name: /Filtrar por UF/ }))
    expect(screen.getByLabelText('CE')).not.toBeChecked()
    expect(within(trigger).getByLabelText('0 filtros ativos')).toBeVisible()
  })

  it('restringe cidades pelas UFs, remove seleções inválidas e preserva a filtragem', () => {
    render(<FilterableStores />)
    fireEvent.click(screen.getByRole('button', { name: /Filtrar/ }))
    fireEvent.click(screen.getByRole('button', { name: /Filtrar por Cidade/ }))
    expect(screen.getByLabelText('Fortaleza')).toBeVisible()
    expect(screen.getByLabelText('Recife')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /Filtrar por UF/ }))
    fireEvent.click(screen.getByLabelText('CE'))
    expect(screen.getByLabelText('Fortaleza')).toBeVisible()
    expect(screen.queryByLabelText('Recife')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Fortaleza'))
    expect(screen.getByText('1 - Loja Ceará')).toBeVisible()
    expect(screen.queryByText('2 - Loja Pernambuco')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('PE'))
    fireEvent.click(screen.getByLabelText('Recife'))
    expect(within(screen.getByRole('button', { name: /Filtrar por Cidade/ })).getByLabelText('2 selecionados')).toBeVisible()
    fireEvent.click(screen.getByLabelText('PE'))
    expect(screen.queryByLabelText('Recife')).not.toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: /Filtrar por Cidade/ })).getByLabelText('1 selecionado')).toBeVisible()
    expect(screen.getByText('1 - Loja Ceará')).toBeVisible()
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
    expect(within(screen.getByRole('table', { name: 'Usuários' })).getByText('Nenhum usuário encontrado.')).toBeVisible()
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

  it('respeita o escopo de UF e não contabiliza uma UF obrigatória como filtro', () => {
    const scopedUsers = [
      { id: 'ce', nome: 'Usuário CE', email: 'ce@avine.com', perfil: 'Promotor', estado: 'CE', ativo: true },
      { id: 'pe', nome: 'Usuário PE', email: 'pe@avine.com', perfil: 'Promotor', estado: 'PE', ativo: true },
      { id: 'ba', nome: 'Usuário BA', email: 'ba@avine.com', perfil: 'Promotor', estado: 'BA', ativo: true },
    ]
    const { rerender } = render(<UsuariosScreen {...userProps} usuarios={scopedUsers} restrictedUfs={['CE', 'PE']} />)
    const trigger = screen.getByRole('button', { name: /Filtrar/ })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'UF' }))
    expect(screen.getByRole('combobox', { name: 'UF' })).toHaveTextContent('TodasCEPE')
    expect(screen.getByRole('combobox', { name: 'UF' })).not.toHaveTextContent('BA')
    fireEvent.change(screen.getByRole('combobox', { name: 'UF' }), { target: { value: 'PE' } })
    expect(screen.getByText('Usuário PE')).toBeVisible()
    expect(screen.queryByText('Usuário CE')).not.toBeInTheDocument()
    expect(screen.queryByText('Usuário BA')).not.toBeInTheDocument()

    rerender(<UsuariosScreen {...userProps} usuarios={scopedUsers} restrictedUfs={['CE']} />)
    expect(screen.queryByRole('combobox', { name: 'UF' })).not.toBeInTheDocument()
    expect(screen.getByText('UF de acesso: CE')).toBeVisible()
    expect(within(trigger).getByLabelText('0 filtros ativos')).toBeVisible()
  })

  it('retorna à primeira página ao pesquisar e ao alterar filtros rápidos, UF ou status', () => {
    const users = Array.from({ length: 12 }, (_, index) => ({
      id: `${index}`,
      nome: `Usuário ${index}`,
      email: `usuario${index}@avine.com`,
      perfil: index === 0 ? 'Admin' : 'Promotor',
      estado: index === 0 ? '' : 'CE',
      ativo: index !== 11,
      acesso_habilitado: index !== 11,
      last_access_at: index === 11 ? null : '2026-08-09T12:00:00.000Z',
    }))
    function Harness() {
      const [search, setSearch] = useState('')
      return <UsuariosScreen {...userProps} usuarios={users} search={search} onSearch={setSearch} />
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(screen.getByRole('button', { name: 'Página anterior' })).not.toBeDisabled()
    fireEvent.change(screen.getByLabelText('Procurar usuários por nome ou e-mail'), { target: { value: 'Usuário' } })
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    fireEvent.click(screen.getByRole('button', { name: 'Promotor (11)' }))
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Filtrar/ }))
    fireEvent.click(screen.getByRole('button', { name: 'UF' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'UF' }), { target: { value: 'CE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Status' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'blocked' } })
    expect(screen.getByText('Usuário 11')).toBeVisible()
    expect(within(screen.getByRole('button', { name: /Filtrar/ })).getByLabelText('2 filtros ativos')).toBeVisible()
  })
})
