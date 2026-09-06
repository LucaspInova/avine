import { describe, expect, it, vi } from 'vitest'
import { createStoresRepository } from './storesRepository'

function storesClient(pages: unknown[][]) {
  const ranges: Array<[number, number]> = []
  const filters: unknown[][] = []
  const client = { from: vi.fn(() => {
    const query: any = { select: vi.fn(() => query), in: vi.fn((...args) => (filters.push(args), query)), eq: vi.fn((...args) => (filters.push(args), query)), or: vi.fn((...args) => (filters.push(args), query)), order: vi.fn(() => query), range: vi.fn((from, to) => { ranges.push([from, to]); return Promise.resolve({ data: pages[ranges.length - 1] ?? [], error: null }) }) }
    return query
  }) }
  return { client, ranges, filters }
}

describe('stores repository com Supabase mockado', () => {
  it('aplica UF e pagina todas as lojas antes da ordenação de domínio', async () => {
    const first = Array.from({ length: 1000 }, (_, index) => ({ codigo: String(1001 - index), uf: 'CE' }))
    const { client, ranges, filters } = storesClient([first, [{ codigo: '2', uf: 'CE' }]])
    const result = await createStoresRepository(client).listStores({ ufs: ['CE'] })
    expect(ranges).toEqual([[0, 999], [1000, 1999]])
    expect(filters).toContainEqual(['uf', ['CE']])
    expect(result[0].codigo).toBe('2')
  })

  it('salva a lista completa e ordenada da rota por RPC', async () => {
    const route = [
      { id: 'v1', loja_id: 'l1', promotor_id: 'p1', posicao: 1 },
      { id: 'v2', loja_id: 'l1', promotor_id: 'p2', posicao: 2 },
      { id: 'v3', loja_id: 'l1', promotor_id: 'p3', posicao: 3 },
      { id: 'v4', loja_id: 'l1', promotor_id: 'p4', posicao: 4 },
    ]
    const rpc = vi.fn().mockResolvedValue({ data: route, error: null })

    await expect(createStoresRepository({ rpc }).saveStoreRoute('l1', ['p1', 'p2', 'p3', 'p4'])).resolves.toEqual(route)
    expect(rpc).toHaveBeenCalledWith('salvar_rota_loja', {
      p_loja_id: 'l1',
      p_promotor_ids: ['p1', 'p2', 'p3', 'p4'],
    })
  })
})
