import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoiceBoundary = vi.hoisted(() => ({ useInvoices: vi.fn(), useInvoiceMutations: vi.fn() }))
vi.mock('../../domains/invoices', () => ({ useInvoices: invoiceBoundary.useInvoices, useInvoiceMutations: invoiceBoundary.useInvoiceMutations }))
vi.mock('../../domains/auth/AuthProvider.jsx', async (importOriginal) => ({ ...await importOriginal(), useAuth: () => ({ profile: { id: 'a1', perfil: 'Admin' } }) }))
import { NotasScreen } from './GerencialApp.jsx'

const mutation = () => ({ mutateAsync: vi.fn() })
const rows = Array.from({ length: 10 }, (_, index) => ({ chave_acesso: `chave-${index}`, nota_fiscal: 100 + index, codigo_cliente: 10, nome_abreviado: `Loja ${index}`, status: 'Pendente', data_referencia: '2026-08-06', uf: 'CE', cidade: 'Fortaleza' }))
const page = { rows, total: 120, counts: { Finalizada: 20, Pendente: 90, Desconhecida: 10 }, ufs: ['CE', 'PE'], cities: ['Fortaleza', 'Sobral'] }
function setup(data = page) {
  invoiceBoundary.useInvoices.mockReturnValue({ data, isLoading: false, isFetching: false, error: null, refetch: vi.fn() })
  invoiceBoundary.useInvoiceMutations.mockReturnValue({ findStore: mutation(), start: mutation(), markUnknown: mutation(), recognize: mutation() })
}
function select(name, option) {
  if (!screen.queryByRole('combobox', { name })) {
    const dialog = screen.getByRole('dialog', { name: 'Filtros' })
    fireEvent.click(within(dialog).getByRole('button', { name }))
  }
  fireEvent.mouseDown(screen.getByRole('combobox', { name }))
  fireEvent.click(within(document.querySelector('.app-select-dropdown')).getByRole('option', { name: option }))
}
function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /Filtrar/ }))
  return screen.getByRole('dialog', { name: 'Filtros' })
}
function openPeriod() {
  if (!screen.queryByLabelText('Data inicial')) fireEvent.click(screen.getByRole('button', { name: 'Período' }))
}

describe('fluxo paginado das Notas gerenciais', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 7, 12)); vi.clearAllMocks(); setup() })
  afterEach(() => vi.useRealTimers())

  it('renderiza somente a página e os agregados devolvidos pelo servidor', () => {
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} restrictedUfs={['CE']} />)
    expect(screen.getByRole('heading', { name: 'Notas Fiscais de Devolução' })).toBeVisible()
    expect(within(screen.getByRole('table', { name: 'Notas fiscais' })).getAllByRole('row')).toHaveLength(11)
    expect(screen.getByText('1–10 de 120')).toBeVisible()
    expect(screen.getByText('Geral').closest('article')).toHaveTextContent('120')
    expect(within(screen.getByLabelText('Totais das notas')).getByText('Finalizada').closest('article')).toHaveTextContent('20')
  })

  it('inclui página, tamanho, filtros e ordenação na fronteira do hook', () => {
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    openFilters()
    select('Status', 'Pendente')
    select('UF', 'CE')
    select('Cidade', 'Fortaleza')
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar Filtros' }))
    expect(screen.queryByRole('dialog', { name: 'Filtros' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'NFD' }))
    select('Linhas por página', '25')
    expect(invoiceBoundary.useInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 25, status: 'Pendente', uf: 'CE', city: 'Fortaleza', sortBy: 'nota_fiscal', direction: 'asc' }))
  })

  it('exibe o indicador de ordenação somente na coluna ativa', () => {
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)
    const table = screen.getByRole('table', { name: 'Notas fiscais' })

    expect(within(table).getAllByText('↓')).toHaveLength(1)
    expect(within(table).queryByText('↕')).not.toBeInTheDocument()

    fireEvent.click(within(table).getByRole('button', { name: 'NFD' }))

    expect(within(table).getAllByText('↑')).toHaveLength(1)
    expect(within(table).getByRole('columnheader', { name: 'NFD' })).toHaveAttribute('aria-sort', 'ascending')
    expect(within(table).getByRole('columnheader', { name: 'EMISSÃO' })).not.toHaveAttribute('aria-sort')
  })

  it('aplica debounce de 300ms antes de pesquisar no servidor', () => {
    const onSearch = vi.fn()
    const { rerender } = render(<NotasScreen search="" onSearch={onSearch} lojas={[]} currentUser={{ id: 'a1' }} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'mercado' } })
    expect(onSearch).toHaveBeenCalledWith('mercado')
    rerender(<NotasScreen search="mercado" onSearch={onSearch} lojas={[]} currentUser={{ id: 'a1' }} />)
    expect(invoiceBoundary.useInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ search: '' }))
    act(() => vi.advanceTimersByTime(300))
    expect(invoiceBoundary.useInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'mercado' }))
  })

  it('mantém datas no intervalo local e expõe estado vazio', () => {
    setup({ ...page, rows: [], total: 0 })
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)
    openFilters()
    openPeriod()
    expect(screen.getByLabelText('Data inicial')).toHaveValue('2026-08-01')
    expect(screen.getByLabelText('Data final')).toHaveAttribute('max', '2026-08-07')
    expect(screen.getByText('Nenhuma NFD encontrada.')).toBeVisible()
  })

  it('trata o período padrão como neutro, conta mudanças e restaura todos os filtros', () => {
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)
    expect(screen.getByRole('button', { name: /Filtrar/ })).toHaveTextContent('0')
    openFilters()
    openPeriod()

    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-07-20' } })
    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-08-06' } })
    select('Status', 'Finalizada')
    expect(screen.getByRole('button', { name: /Filtrar/ })).toHaveTextContent('3')
    expect(invoiceBoundary.useInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ startDate: '2026-08-01', endDate: '2026-08-07', status: '', page: 1 }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar Filtros' }))
    expect(invoiceBoundary.useInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ startDate: '2026-07-20', endDate: '2026-08-06', status: 'Finalizada', page: 1 }))

    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    openPeriod()
    expect(screen.getByLabelText('Data inicial')).toHaveValue('2026-08-01')
    expect(screen.getByLabelText('Data final')).toHaveValue('2026-08-07')
    expect(screen.getByRole('button', { name: /Filtrar/ })).toHaveTextContent('0')
    expect(invoiceBoundary.useInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ startDate: '2026-08-01', endDate: '2026-08-07', status: '', uf: '', city: '', page: 1 }))
  })

  it('ajusta intervalos inválidos e limita a data final ao dia atual', () => {
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)
    openFilters()
    openPeriod()
    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-07-25' } })
    expect(screen.getByLabelText('Data inicial')).toHaveValue('2026-07-25')
    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-08-20' } })
    expect(screen.getByLabelText('Data final')).toHaveValue('2026-08-07')
    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-08-20' } })
    expect(screen.getByLabelText('Data inicial')).toHaveValue('2026-08-07')
  })

  it('preserva o drill-down e não oferece UFs fora da restrição gerencial', () => {
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} restrictedUfs={['CE']} />)
    openFilters()
    select('UF', 'CE')
    select('Cidade', 'Fortaleza')
    select('UF', 'Todas')
    expect(screen.getByRole('combobox', { name: 'Cidade' })).toHaveValue('')

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'UF' }))
    const options = within(document.querySelector('.app-select-dropdown'))
    expect(options.getByRole('option', { name: 'CE' })).toBeVisible()
    expect(options.queryByRole('option', { name: 'PE' })).not.toBeInTheDocument()
    expect(invoiceBoundary.useInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ restrictedUfs: ['CE'], uf: '', city: '', page: 1 }))
  })

  it.each([
    ['carga inicial', { data: undefined, isLoading: true, isFetching: true, error: null }],
    ['refetch com dados anteriores', { data: page, isLoading: false, isFetching: true, error: null }],
  ])('exibe loading acessível e oculta dados durante %s', (_label, query) => {
    invoiceBoundary.useInvoices.mockReturnValue({ ...query, refetch: vi.fn() })
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)

    const loading = screen.getByRole('status', { name: /Carregando notas fiscais/ })
    expect(loading).toBeVisible()
    expect(loading.querySelector('.ui-spinner')).toHaveStyle({ borderTopColor: '#196b42' })
    expect(screen.queryByRole('table', { name: 'Notas fiscais' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Totais das notas')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Paginação das notas fiscais' })).not.toBeInTheDocument()
  })

  it('mostra o erro após a consulta terminar', () => {
    invoiceBoundary.useInvoices.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, error: new Error('Falha ao consultar'), refetch: vi.fn() })
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)
    expect(screen.getByText('Falha ao consultar')).toBeVisible()
    expect(screen.queryByRole('status', { name: /Carregando/ })).not.toBeInTheDocument()
  })
})
