import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
const rpc = boundary.rpc
const from = boundary.from
vi.mock('../../shared/lib/supabaseClient', () => ({ supabase: { rpc: boundary.rpc, from: boundary.from } }))
import { listInvoiceUnknownHistory, listInvoicesOverview, markInvoiceUnknown, normalizeUnknownInvoiceNumber, startInvoiceProcess } from './invoicesRepository'

describe('repositório paginado de NFDs', () => {
  beforeEach(() => {
    rpc.mockReset()
    from.mockReset()
  })

  it('envia filtros, ordenação, limite e deslocamento ao RPC uma única vez', async () => {
    const response = { rows: [{ chave_acesso: '1' }], total: 21, counts: { Finalizada: 1, Pendente: 20, Desconhecida: 0 }, ufs: ['CE'], cities: ['Fortaleza'] }
    rpc.mockResolvedValue({ data: response, error: null })
    await expect(listInvoicesOverview({ startDate: '2026-08-01', endDate: '2026-08-10', status: 'Pendente', uf: 'CE', city: 'Fortaleza', responsibleId: 'u1', createdById: 'u2', updatedById: 'u3', routePromoterId: 'u4', search: 'Loja 10', sortBy: 'nota_fiscal', direction: 'asc', page: 3, pageSize: 10 })).resolves.toEqual(response)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('listar_nfd_notas_gerencial', expect.objectContaining({
      p_status: 'Pendente', p_uf: 'CE', p_cidade: 'Fortaleza', p_pesquisa: 'Loja 10',
      p_responsavel_id: 'u1', p_criado_por_id: 'u2', p_atualizado_por_id: 'u3', p_promotor_rota_id: 'u4',
      p_ordenar_por: 'nota_fiscal', p_direcao: 'asc', p_limite: 10, p_deslocamento: 20,
    }))
  })

  it('encaminha o sinal de cancelamento ao cliente Supabase', async () => {
    const response = { rows: [], total: 0, counts: {}, ufs: [], cities: [] }
    const abortSignal = vi.fn().mockResolvedValue({ data: response, error: null })
    rpc.mockReturnValue({ abortSignal })
    const controller = new AbortController()

    await expect(listInvoicesOverview({ page: 1, pageSize: 10 }, controller.signal)).resolves.toEqual(response)
    expect(abortSignal).toHaveBeenCalledWith(controller.signal)
  })

  it('propaga cancelamentos sem registrar erro no console', async () => {
    const abortSignal = vi.fn()
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    abortSignal.mockRejectedValue(abortError)
    rpc.mockReturnValue({ abortSignal })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(listInvoicesOverview({ page: 1, pageSize: 10 }, new AbortController().signal)).rejects.toBe(abortError)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('inicia o processo e hidrata os detalhes da NFD pela chave de acesso', async () => {
    const note = { chave_acesso: 'chave-869', nota_fiscal: 869, detalhes: [{ codigo_produto: 'P1' }] }
    const single = vi.fn().mockResolvedValue({ data: note, error: null })
    const eq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq })
    from.mockReturnValue({ select })
    rpc.mockResolvedValue({ data: 'processo-1', error: null })

    await expect(startInvoiceProcess('loja-1', 'chave-869')).resolves.toEqual({ processId: 'processo-1', note })
    expect(rpc).toHaveBeenCalledWith('iniciar_fstd_produtos_v2', { p_loja_id: 'loja-1', p_nfd_chave_acesso: 'chave-869' })
    expect(from).toHaveBeenCalledWith('nfd_notas')
    expect(eq).toHaveBeenCalledWith('chave_acesso', 'chave-869')
  })

  it('normaliza o número e consulta o histórico ordenado da loja', async () => {
    const history = [{ comentario_id: 'c1', comentario: 'Inicial' }]
    const secondOrder = vi.fn().mockResolvedValue({ data: history, error: null })
    const firstOrder = vi.fn().mockReturnValue({ order: secondOrder })
    const secondEq = vi.fn().mockReturnValue({ order: firstOrder })
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq })
    const select = vi.fn().mockReturnValue({ eq: firstEq })
    from.mockReturnValue({ select })

    expect(normalizeUnknownInvoiceNumber('001.234')).toBe('1234')
    await expect(listInvoiceUnknownHistory('loja-1', '001.234')).resolves.toEqual(history)
    expect(from).toHaveBeenCalledWith('nfd_desconhecimento_historico')
    expect(firstEq).toHaveBeenCalledWith('loja_id', 'loja-1')
    expect(secondEq).toHaveBeenCalledWith('nfd_numero_normalizado', '1234')
  })

  it('registra abertura ou retificação pela RPC atômica', async () => {
    rpc.mockResolvedValue({ data: 'caso-1', error: null })
    await expect(markInvoiceUnknown(
      { id: 'loja-1', codigo: '10', nome: 'Loja', uf: 'CE', cidade: 'Fortaleza' },
      { codigo_cliente: 10, nota_fiscal: 1234, chave_acesso: 'chave-1' },
      'Correção do coordenador',
      'retificacao',
    )).resolves.toBeUndefined()

    expect(rpc).toHaveBeenCalledWith('registrar_desconhecimento_nfd', expect.objectContaining({
      p_loja_id: 'loja-1',
      p_nfd_numero: '1234',
      p_comentario: 'Correção do coordenador',
      p_tipo: 'retificacao',
    }))
  })
})
