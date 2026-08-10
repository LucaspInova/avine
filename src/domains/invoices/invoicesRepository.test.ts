import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ rpc: vi.fn() }))
const rpc = boundary.rpc
vi.mock('../../shared/lib/supabaseClient', () => ({ supabase: { rpc: boundary.rpc } }))
import { listInvoicesOverview } from './invoicesRepository'

describe('repositório paginado de NFDs', () => {
  beforeEach(() => rpc.mockReset())

  it('envia filtros, ordenação, limite e deslocamento ao RPC uma única vez', async () => {
    const response = { rows: [{ chave_acesso: '1' }], total: 21, counts: { Finalizada: 1, Pendente: 20, Desconhecida: 0 }, ufs: ['CE'], cities: ['Fortaleza'] }
    rpc.mockResolvedValue({ data: response, error: null })
    await expect(listInvoicesOverview({ startDate: '2026-08-01', endDate: '2026-08-10', status: 'Pendente', uf: 'CE', city: 'Fortaleza', search: 'Loja 10', sortBy: 'nota_fiscal', direction: 'asc', page: 3, pageSize: 10 })).resolves.toEqual(response)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('listar_nfd_notas_gerencial', expect.objectContaining({
      p_status: 'Pendente', p_uf: 'CE', p_cidade: 'Fortaleza', p_pesquisa: 'Loja 10',
      p_ordenar_por: 'nota_fiscal', p_direcao: 'asc', p_limite: 10, p_deslocamento: 20,
    }))
  })
})
