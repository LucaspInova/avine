import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CadastroModal, EditarUsuarioModal, InformacoesUsuarioModal, UsuariosScreen } from './GerencialApp.jsx'
import { hasApplicationAccess, hasConsistentRole, routeForProfile } from '../../domains/auth/AuthProvider.jsx'
import { getProfileLabel } from '../../shared/lib/profileLabels.js'

const usuarios = [
  {
    id: 'gerencial-1',
    auth_user_id: 'auth-gerencial-1',
    nome: 'ANA GERENCIAL',
    email: 'ana.gerencial@avine.com',
    perfil: 'Gerencial',
    estado: '',
    ativo: true,
    acesso_habilitado: true,
    fotos_habilitadas: false,
    last_access_at: '2026-08-07T12:30:00.000Z',
  },
  {
    id: 'promotor-1',
    auth_user_id: 'auth-promotor-1',
    nome: 'BRUNO PROMOTOR',
    email: 'bruno.promotor@avine.com',
    perfil: 'Promotor',
    estado: 'CE',
    ativo: true,
    acesso_habilitado: true,
    fotos_habilitadas: true,
  },
  {
    id: 'promotor-2',
    auth_user_id: 'auth-promotor-2',
    nome: 'CARLA PROMOTORA',
    email: 'carla.promotora@avine.com',
    perfil: 'Promotor',
    estado: 'PE',
    ativo: false,
    acesso_habilitado: false,
    fotos_habilitadas: false,
  },
]

const noop = vi.fn()

function UsersHarness() {
  const [search, setSearch] = useState('')

  return (
    <UsuariosScreen
      currentUser={usuarios[0]}
      usuarios={usuarios}
      lojaPromotores={[{ promotor_id: 'promotor-1', loja_id: 'loja-1' }, { promotor_id: 'promotor-1', loja_id: 'loja-2' }]}
      loading={false}
      error=""
      busy={false}
      editId=""
      editForm={{ nome: '', email: '', senha: '', ativo: true }}
      search={search}
      onSearch={setSearch}
      onOpenCadastro={noop}
      onOpenUsuario={noop}
      onEditChange={noop}
      onStartEdit={noop}
      onCancelEdit={noop}
      onSaveEdit={noop}
      onDelete={noop}
    />
  )
}

describe('Cadastro de Usuários', () => {
  it('combina tabs de perfil, pesquisa, UF e status sobre a mesma tabela sem controles redundantes', () => {
    render(<UsersHarness />)

    const table = screen.getByRole('table', { name: 'Cadastro de Usuários' })
    expect(within(table).getByText('ANA GERENCIAL')).toBeInTheDocument()
    expect(within(table).getByText('BRUNO PROMOTOR')).toBeInTheDocument()
    expect(within(table).getByText('CARLA PROMOTORA')).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'ÚLTIMO ACESSO' })).toBeInTheDocument()
    expect(within(table).queryByRole('columnheader', { name: 'GERENCIAL' })).not.toBeInTheDocument()
    expect(within(table).queryByRole('columnheader', { name: 'AÇÕES' })).not.toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'LOJAS' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Mais ações para/)).not.toBeInTheDocument()
    expect(screen.getByText('BRUNO PROMOTOR').closest('[role="row"]')).toHaveTextContent('2')
    expect(within(table).getByText('07/08/2026, 12:30')).toBeInTheDocument()
    expect(within(table).getAllByText('Nunca')).toHaveLength(2)

    expect(screen.queryByLabelText('Perfil')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Resumo de usuários')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Promotor (2)' }))
    expect(within(table).getByText('BRUNO PROMOTOR')).toBeInTheDocument()
    expect(within(table).queryByText('ANA GERENCIAL')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('UF'), { target: { value: 'CE' } })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'active' } })
    fireEvent.change(screen.getByLabelText('Pesquisar por nome ou e-mail'), {
      target: { value: 'bruno.promotor@avine.com' },
    })

    expect(within(table).getByText('BRUNO PROMOTOR')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gerencial (1)' }))
    expect(within(table).getByText('Nenhum usuário encontrado.')).toBeInTheDocument()
  })

  it('abre as informações de qualquer perfil ao clicar ou usar o teclado na linha', () => {
    const onOpenUsuario = vi.fn()
    render(<UsersHarness />)
    const adminRow = screen.getByText('ANA GERENCIAL').closest('[role="row"]')
    fireEvent.click(adminRow)
    expect(noop).toHaveBeenCalled()

    render(
      <UsuariosScreen currentUser={usuarios[0]} usuarios={usuarios} loading={false} error="" busy={false}
        editId="" editForm={{}} search="" onSearch={noop} onOpenCadastro={noop}
        onOpenUsuario={onOpenUsuario} onEditChange={noop} onCancelEdit={noop} onSaveEdit={noop} onDelete={noop} />,
    )
    fireEvent.keyDown(screen.getAllByText('BRUNO PROMOTOR')[1].closest('[role="row"]'), { key: 'Enter' })
    expect(onOpenUsuario).toHaveBeenCalledWith(expect.objectContaining({ id: 'promotor-1' }))
  })

  it('mostra a roteirização atribuída no modal do promotor', () => {
    render(<InformacoesUsuarioModal usuario={usuarios[1]} lojas={[
      { id: 'loja-1', codigo: '13015', nome: 'EVANDRO 05', uf: 'PI' },
    ]} onClose={noop} onEdit={noop} onTogglePhotos={noop} />)
    expect(screen.getByRole('region', { name: 'Roteirização do promotor' })).toHaveTextContent('13015 - PI')
    expect(screen.getByText('EVANDRO 05')).toBeInTheDocument()
  })

  it('oferece promoção e rebaixamento de perfis ao Admin', () => {
    render(<EditarUsuarioModal form={{ ...usuarios[0], senha: '' }} usuarios={usuarios} usuarioId="gerencial-1"
      busy={false} deleting={false} error="" onChange={noop} onBack={noop} onClose={noop}
      onSubmit={noop} onDelete={noop} allowedProfiles={['Admin', 'Gerencial', 'Promotor']} />)
    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gerencial' })).toBeInTheDocument()
  })

  it('mantém Supervisor preparado sem habilitar um fluxo inexistente', () => {
    const gerencialForm = {
      email: '',
      nome: '',
      senha: '',
      perfil: 'Gerencial',
      estado: '',
      fotos_habilitadas: false,
    }
    const { rerender } = render(
      <CadastroModal
        form={gerencialForm}
        usuarios={usuarios}
        busy={false}
        error=""
        onChange={noop}
        onClose={noop}
        onSubmit={noop}
      />,
    )

    expect(screen.getByRole('button', { name: 'Gerencial' })).not.toBeDisabled()

    rerender(
      <CadastroModal
        form={{ ...gerencialForm, perfil: 'Promotor' }}
        usuarios={usuarios}
        busy={false}
        error=""
        onChange={noop}
        onClose={noop}
        onSubmit={noop}
      />,
    )

    expect(screen.getByRole('group', { name: 'UF' })).toBeInTheDocument()
    expect(screen.getByLabelText('Gerencial responsável')).toBeDisabled()
  })


  it('permite selecionar múltiplas UFs para Gerencial', () => {
    const onChange = vi.fn()
    render(
      <CadastroModal
        form={{ email: '', nome: '', senha: '', perfil: 'Gerencial', auth_role: 'gerencial', estado: 'CE', ufs: ['CE'], fotos_habilitadas: false }}
        usuarios={usuarios}
        currentUser={{ perfil: 'Admin', auth_role: 'admin', ufs: [] }}
        busy={false}
        error=""
        onChange={onChange}
        onClose={noop}
        onSubmit={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'PE' }))
    expect(onChange).toHaveBeenCalledWith({ ufs: ['CE', 'PE'], estado: 'CE' })
  })

  it('aplica os novos nomes visuais e rotas por perfil', () => {
    expect(getProfileLabel('Gerencial')).toBe('Gerencial')
    expect(getProfileLabel('Supervisor')).toBe('Supervisor')
    expect(getProfileLabel('Promotor')).toBe('Promotor')
    expect(routeForProfile({ perfil: 'Gerencial' })).toBe('/gerencial')
    expect(routeForProfile({ perfil: 'Supervisor' })).toBe('/')
    expect(routeForProfile({ perfil: 'Promotor' })).toBe('/acesso/promotor')
    expect(routeForProfile({ perfil: 'Admin', auth_role: 'gerencial' })).toBe('/admin')
    const inconsistentAdmin = { perfil: 'Admin', auth_role: 'gerencial', ativo: true, acesso_habilitado: true, auth_user_id: 'auth-admin' }
    expect(hasConsistentRole(inconsistentAdmin)).toBe(false)
    expect(hasApplicationAccess(inconsistentAdmin)).toBe(false)
  })
})
