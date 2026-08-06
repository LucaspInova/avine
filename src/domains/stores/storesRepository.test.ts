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
})
