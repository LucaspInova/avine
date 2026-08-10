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
  invoiceBoundary.useInvoices.mockReturnValue({ data, isLoading: false, error: null, refetch: vi.fn() })
  invoiceBoundary.useInvoiceMutations.mockReturnValue({ findStore: mutation(), start: mutation(), markUnknown: mutation(), recognize: mutation() })
}
function select(name, option) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name }))
  fireEvent.click(within(document.querySelector('.app-select-dropdown')).getByRole('option', { name: option }))
}

describe('fluxo paginado das Notas gerenciais', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 7, 12)); vi.clearAllMocks(); setup() })
  afterEach(() => vi.useRealTimers())

  it('renderiza somente a página e os agregados devolvidos pelo servidor', () => {
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} restrictedUfs={['CE']} />)
    expect(within(screen.getByRole('table', { name: 'Notas fiscais' })).getAllByRole('row')).toHaveLength(11)
    expect(screen.getByText('1–10 de 120')).toBeVisible()
    expect(screen.getByText('Geral').closest('article')).toHaveTextContent('120')
    expect(within(screen.getByLabelText('Totais das notas')).getByText('Finalizada').closest('article')).toHaveTextContent('20')
  })

  it('inclui página, tamanho, filtros e ordenação na fronteira do hook', () => {
    render(<NotasScreen search="" onSearch={vi.fn()} lojas={[]} currentUser={{ id: 'a1' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    select('Status', 'Pendente')
    select('UF', 'CE')
    select('Cidade', 'Fortaleza')
    fireEvent.click(screen.getByRole('button', { name: 'NFD' }))
    select('Linhas por página', '25')
    expect(invoiceBoundary.useInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 25, status: 'Pendente', uf: 'CE', city: 'Fortaleza', sortBy: 'nota_fiscal', direction: 'asc' }))
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
    expect(screen.getByLabelText('Data inicial')).toHaveValue('2026-08-01')
    expect(screen.getByLabelText('Data final')).toHaveAttribute('max', '2026-08-07')
    expect(screen.getByText('Nenhuma NFD encontrada.')).toBeVisible()
  })
})
