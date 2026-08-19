import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ from: vi.fn() }))
const invoices = vi.hoisted(() => ({ fetchAllNfdNotas: vi.fn() }))

vi.mock('../../../shared/lib/supabaseClient', () => ({ supabase: { from: boundary.from } }))
vi.mock('../../invoices', () => ({ fetchAllNfdNotas: invoices.fetchAllNfdNotas }))

import { getPromotorNfdStartDate, listFstdProcessesForNfd, listPromotorInvoices } from './promotorRepository'

describe('consulta focalizada de processos FSTD', () => {
  beforeEach(() => {
    boundary.from.mockReset()
    invoices.fetchAllNfdNotas.mockReset()
  })

  it('busca apenas o processo da NFD aberta e seus produtos', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: 'processo-1', nfd_chave_acesso: 'NFD-1' }], error: null })
    const order = vi.fn().mockReturnValue({ limit })
    const eq = vi.fn().mockReturnValue({ order })
    const processSelect = vi.fn().mockReturnValue({ eq })
    const productsIn = vi.fn().mockResolvedValue({ data: [{ id: 'produto-1', processo_id: 'processo-1', codigo_produto: 'P1' }], error: null })
    const productsSelect = vi.fn().mockReturnValue({ in: productsIn })
    const divisionsIn = vi.fn().mockResolvedValue({ data: [{ produto_id: 'produto-1', motivo_id: 'motivo-1', quantidade: 2 }], error: null })
    const divisionsSelect = vi.fn().mockReturnValue({ in: divisionsIn })

    boundary.from.mockImplementation((table: string) => {
      if (table === 'fstd_processos') return { select: processSelect }
      if (table === 'fstd_produtos') return { select: productsSelect }
      if (table === 'fstd_produto_motivos') return { select: divisionsSelect }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) }
    })

    await expect(listFstdProcessesForNfd('NFD-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'processo-1',
        produtos: [expect.objectContaining({ id: 'produto-1', divisoes: [expect.objectContaining({ motivo_id: 'motivo-1' })] })],
      }),
    ])

    expect(eq).toHaveBeenCalledWith('nfd_chave_acesso', 'NFD-1')
    expect(limit).toHaveBeenCalledWith(1)
    expect(productsIn).toHaveBeenCalledWith('processo_id', ['processo-1'])
    expect(divisionsIn).toHaveBeenCalledWith('produto_id', ['produto-1'])
    expect(boundary.from.mock.calls).toEqual([
      ['fstd_processos'],
      ['fstd_produtos'],
      ['fstd_produto_motivos'],
    ])
  })

  it('restringe automaticamente as NFDs do promotor ao último mês de emissão', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T12:00:00'))

    const nfdQuery = {
      in: vi.fn(),
      gte: vi.fn(),
      order: vi.fn(),
    }
    nfdQuery.in.mockReturnValue(nfdQuery)
    nfdQuery.gte.mockReturnValue(nfdQuery)
    nfdQuery.order.mockReturnValue(nfdQuery)
    invoices.fetchAllNfdNotas.mockImplementation(async (_select, configure) => {
      configure(nfdQuery)
      return [{ chave_acesso: 'NFD-1', nota_fiscal: 1, codigo_cliente: 10 }]
    })

    const range = vi.fn().mockResolvedValue({ data: [], error: null })
    const order = vi.fn().mockReturnValue({ range })
    const inFilter = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ in: inFilter })
    boundary.from.mockImplementation((table: string) => {
      if (table === 'fstd_legado') return { select }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) }
    })

    await expect(listPromotorInvoices([{ id: 'loja-10', codigo: 10 }])).resolves.toEqual([
      expect.objectContaining({ numero: '1', loja_id: 'loja-10' }),
    ])

    expect(nfdQuery.in).toHaveBeenCalledWith('codigo_cliente', [10])
    expect(nfdQuery.gte).toHaveBeenCalledWith('data_emissao', '2026-07-19')
    expect(nfdQuery.order).toHaveBeenNthCalledWith(1, 'data_emissao', { ascending: false })
    expect(nfdQuery.order).toHaveBeenNthCalledWith(2, 'nota_fiscal', { ascending: false })
    vi.useRealTimers()
  })

  it('calcula o limite de um mês calendário sem avançar o dia em meses menores', () => {
    expect(getPromotorNfdStartDate(new Date('2026-03-31T12:00:00'))).toBe('2026-02-28')
  })
})
