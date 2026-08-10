import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoiceBoundary = vi.hoisted(() => ({ useInvoices: vi.fn(), useInvoiceMutations: vi.fn() }))
vi.mock('../../domains/invoices', () => ({
  useInvoices: invoiceBoundary.useInvoices,
  useInvoiceMutations: invoiceBoundary.useInvoiceMutations,
}))
vi.mock('../../domains/auth/AuthProvider.jsx', async (importOriginal) => ({
  ...await importOriginal(),
  useAuth: () => ({ profile: { id: 'a1', perfil: 'Admin' } }),
}))

import { NotasScreen } from './GerencialApp.jsx'

const mutation = () => ({ mutateAsync: vi.fn() })
const notes = Array.from({ length: 11 }, (_, index) => ({
  chave_acesso: `chave-${index}`, nota_fiscal: `${100 + index}`, codigo_cliente: '10',
  nome_abreviado: `Loja ${index}`, status: 'Pendente', data_referencia: '2026-08-06',
  uf: 'CE', cidade: 'Fortaleza', quantidade_galinha: 1, quantidade_codorna: 0,
}))

function setupQuery(overrides = {}) {
  invoiceBoundary.useInvoices.mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn(), ...overrides })
  invoiceBoundary.useInvoiceMutations.mockReturnValue({ findStore: mutation(), start: mutation(), markUnknown: mutation(), recognize: mutation() })
}

function selectFilter(name, option) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name }))
  fireEvent.click(within(document.querySelector('.app-select-dropdown')).getByRole('option', { name: option }))
}

describe('tela proprietária de Notas gerencial', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 7, 12))
    vi.clearAllMocks()
    setupQuery()
  })

  afterEach(() => vi.useRealTimers())

  it('representa carregamento, erro e vazio retornados pela fronteira de domínio', () => {
    setupQuery({ isLoading: true })
    const { rerender } = render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)
    expect(screen.getByText('Carregando notas fiscais...')).toBeVisible()
    setupQuery({ error: new Error('Falha de integração das notas') })
    rerender(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)
    expect(screen.getByText('Falha de integração das notas')).toBeVisible()
    setupQuery()
    rerender(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)
    expect(screen.getByText('Nenhuma NFD encontrada.')).toBeVisible()
  })

  it('exibe filtros, totais e todas as notas sem paginação, e abre o modal', () => {
    setupQuery({ data: notes })
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} restrictedUfs={['CE']} />)
    expect(screen.getByText('Loja 0')).toBeVisible()
    expect(screen.getByText('Loja 10')).toBeVisible()
    expect(screen.getByRole('columnheader', { name: 'EMISSÃO' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: 'UF' })).toBeVisible()
    expect(screen.getByLabelText('Data inicial')).toHaveValue('2026-08-01')
    expect(screen.getByLabelText('Data final')).toHaveValue('2026-08-07')
    expect(screen.getByLabelText('Totais das notas')).toHaveTextContent('Geral11')
    expect(screen.queryByRole('button', { name: 'Próxima página' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('row', { name: /Loja 10/ }))
    expect(screen.getByRole('dialog', { name: '10 - 110' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar nota fiscal' }))
    expect(screen.queryByRole('dialog', { name: '10 - 110' })).not.toBeInTheDocument()
  })

  it('filtra as linhas por Status, UF e Cidade', () => {
    setupQuery({ data: [
      { ...notes[0], nome_abreviado: 'Loja Fortaleza pendente', status: 'Pendente', uf: ' ce ', cidade: 'Fortaleza' },
      { ...notes[1], nome_abreviado: 'Loja Sobral finalizada', status: 'Finalizada', uf: 'CE', cidade: 'Sobral' },
      { ...notes[2], nome_abreviado: 'Loja Recife pendente', status: 'Pendente', uf: 'PE', cidade: 'Recife' },
    ] })
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)

    selectFilter('Status', 'Pendente')
    expect(screen.getByText('Loja Fortaleza pendente')).toBeVisible()
    expect(screen.getByText('Loja Recife pendente')).toBeVisible()
    expect(screen.queryByText('Loja Sobral finalizada')).not.toBeInTheDocument()

    selectFilter('UF', 'CE')
    expect(screen.getByText('Loja Fortaleza pendente')).toBeVisible()
    expect(screen.queryByText('Loja Recife pendente')).not.toBeInTheDocument()
    expect(screen.queryByText('Loja Sobral finalizada')).not.toBeInTheDocument()

    selectFilter('Cidade', 'Fortaleza')
    expect(screen.getByText('Loja Fortaleza pendente')).toBeVisible()
    expect(screen.queryByText('Loja Recife pendente')).not.toBeInTheDocument()
    expect(screen.queryByText('Loja Sobral finalizada')).not.toBeInTheDocument()
  })

  it('limita as datas ao dia local atual', () => {
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)
    const startDate = screen.getByLabelText('Data inicial')
    const endDate = screen.getByLabelText('Data final')

    expect(endDate).toHaveAttribute('max', '2026-08-07')
    expect(startDate).toHaveAttribute('max', '2026-08-07')

    fireEvent.change(endDate, { target: { value: '2026-08-06' } })
    fireEvent.change(endDate, { target: { value: '2026-08-07' } })
    expect(endDate).toHaveValue('2026-08-07')
  })

  it('rejeita datas futuras e mantém a data inicial dentro do intervalo', () => {
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)
    const startDate = screen.getByLabelText('Data inicial')
    const endDate = screen.getByLabelText('Data final')

    fireEvent.change(endDate, { target: { value: '2026-08-08' } })
    expect(endDate).toHaveValue('2026-08-07')

    fireEvent.change(endDate, { target: { value: '2026-08-05' } })
    expect(startDate).toHaveAttribute('max', '2026-08-05')
    fireEvent.change(startDate, { target: { value: '2026-08-06' } })
    expect(startDate).toHaveValue('2026-08-05')
  })
})
