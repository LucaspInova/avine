import { describe, expect, it } from 'vitest'
import { calculateManagementDashboard } from './dashboardCalculations'
import type { ManagementDashboardSource } from './types'

function createSource(): ManagementDashboardSource {
  return {
    current: {
      ufs: ['CE'],
      cities: ['Fortaleza'],
      notes: [
        {
          chave_acesso: 'legacy-key', estabelecimento: 'Loja Legado', nota_fiscal: 10, data_emissao: '2026-08-04', data_referencia: '2026-08-04', codigo_cliente: 1, nome_abreviado: 'Loja Legado', uf: 'CE', cidade: 'Fortaleza', quantidade_galinha: 100, quantidade_codorna: 20, valor_total: 300, status: 'Finalizada',
        },
        {
          chave_acesso: 'modern-key', estabelecimento: 'Loja Nova', nota_fiscal: 11, data_emissao: '2026-08-05', data_referencia: '2026-08-05', codigo_cliente: 2, nome_abreviado: 'Loja Nova', uf: 'CE', cidade: 'Fortaleza', quantidade_galinha: 80, quantidade_codorna: 30, valor_total: 250, status: 'Finalizada',
        },
        {
          chave_acesso: 'pending-key', estabelecimento: 'Loja Pendente', nota_fiscal: 12, data_emissao: '2026-08-06', data_referencia: '2026-08-06', codigo_cliente: 3, nome_abreviado: 'Loja Pendente', uf: 'CE', cidade: 'Fortaleza', quantidade_galinha: 40, quantidade_codorna: 0, valor_total: 150, status: 'Pendente',
        },
      ],
    },
    previous: { ufs: [], cities: [], notes: [] },
    processes: [{ id: 'process-1', nfd_chave_acesso: 'modern-key', status: 'concluida', finalizada_em: '2026-08-08T10:00:00Z', created_at: '2026-08-05T10:00:00Z', is_avulsa: false }],
    products: [{ id: 'product-1', processo_id: 'process-1', produto_id: 'catalog-1', codigo_produto: 'ABC', nome: 'Produto novo', quantidade_faturada_galinha: 80, quantidade_faturada_codorna: 0, quantidade_retorno: 16, motivo_id: 'reason-1', status: 'concluido' }],
    productReasons: [{ produto_id: 'product-1', motivo_id: 'reason-1', quantidade: 16 }],
    reasons: [{ id: 'reason-1', nome: 'Avaria na entrega' }],
    catalogProducts: [{ id: 'catalog-1', nome: 'Produto novo', categoria: 'Galinha' }],
    legacy: [{ legado_id: 1, codigo_loja: '1', numero_nfd: '10', data_preenchimento: '2026-08-06T10:00:00Z', motivo: 'Avaria na entrega', qtd_total_galinha: 100, qtd_retorno_galinha: 10, qtd_total_codorna: 20, qtd_retorno_codorna: 2 }],
    sourceErrors: [],
  }
}

describe('cálculos da Dashboard Gerencial', () => {
  it('soma NFDs consolidadas, usa retornos legados e modernos sem dupla contagem', () => {
    const dashboard = calculateManagementDashboard(createSource())

    expect(dashboard.current.totalNfds).toBe(3)
    expect(dashboard.current.status).toEqual({ Finalizada: 2, Pendente: 1, Desconhecida: 0 })
    expect(dashboard.current.financialTotal).toBe(700)
    expect(dashboard.current.returns).toMatchObject({ galinha: 26, codorna: 2, total: 28, count: 2 })
    expect(dashboard.current.averageDays).toBe(2.5)
  })

  it('mantém o ranking de produtos restrito aos FSTDs modernos detalhados', () => {
    const dashboard = calculateManagementDashboard(createSource())

    expect(dashboard.products).toEqual([expect.objectContaining({ name: 'Produto novo', category: 'Galinha', returned: 16, returnPercentage: 20, mainReason: 'Avaria na entrega' })])
  })

  it('ordena lojas pelo menor percentual de retorno e conta NFDs devolvidas', () => {
    const dashboard = calculateManagementDashboard(createSource())

    expect(dashboard.stores.map((store) => ({ name: store.name, returns: store.returns }))).toEqual([
      { name: 'Loja Pendente', returns: 0 },
      { name: 'Loja Legado', returns: 1 },
      { name: 'Loja Nova', returns: 1 },
    ])
  })

  it('mantém o card limitado e disponibiliza todas as lojas para o modal', () => {
    const source = createSource()
    source.current.notes.push(...Array.from({ length: 5 }, (_, index) => ({
      ...source.current.notes[0],
      codigo_cliente: 10 + index,
      nome_abreviado: `Loja extra ${index + 1}`,
      estabelecimento: `Loja extra ${index + 1}`,
      status: 'Pendente' as const,
    })))

    const dashboard = calculateManagementDashboard(source)

    expect(dashboard.stores).toHaveLength(6)
    expect(dashboard.allStores).toHaveLength(8)
  })
})
