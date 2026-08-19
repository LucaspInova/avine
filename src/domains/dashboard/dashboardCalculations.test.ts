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
    invoiceItems: [
      { chave_acesso: 'legacy-key', codigo_produto: 'LEG', quantidade_galinha: 100, valor_galinha: 250, quantidade_codorna: 20, valor_codorna: 50 },
      { chave_acesso: 'modern-key', codigo_produto: 'ABC', quantidade_galinha: 80, valor_galinha: 200, quantidade_codorna: 30, valor_codorna: 50 },
    ],
    products: [{ id: 'product-1', processo_id: 'process-1', produto_id: 'catalog-1', codigo_produto: 'ABC', nome: 'Produto novo', quantidade_faturada_galinha: 80, quantidade_faturada_codorna: 0, quantidade_retorno: 16, motivo_id: 'reason-1', status: 'concluido' }],
    productReasons: [{ produto_id: 'product-1', motivo_id: 'reason-1', quantidade: 16 }],
    reasons: [{ id: 'reason-1', nome: 'Avaria na entrega' }],
    catalogProducts: [{ id: 'catalog-1', nome: 'Produto novo', categoria: 'Galinha' }],
    reports: [],
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
    expect(dashboard.current.financial).toEqual({ galinhaBilled: 600, codornaBilled: 100, galinhaReturn: 65, codornaReturn: 5 })
    expect(dashboard.current.returns).toMatchObject({ galinha: 26, codorna: 2, total: 28, count: 2 })
    expect(dashboard.current.modernGalinhaBilled).toBe(80)
    expect(dashboard.current.modernCodornaBilled).toBe(0)
    expect(dashboard.current.finalized.galinhaBilled).toBe(180)
    expect(dashboard.current.finalized.codornaBilled).toBe(50)
    expect(dashboard.current.finalized.returns).toMatchObject({ galinha: 26, codorna: 2, total: 28, count: 2 })
    expect(dashboard.current.modernReturns).toMatchObject({ galinha: 16, codorna: 0, total: 16, count: 1 })
    expect(dashboard.current.averageDays).toBe(2.5)
    expect(dashboard.financialSeries).toEqual([
      { date: '2026-08-04', value: 300 },
      { date: '2026-08-05', value: 250 },
      { date: '2026-08-06', value: 150 },
    ])
  })

  it('mantém o ranking de produtos restrito aos FSTDs modernos detalhados', () => {
    const dashboard = calculateManagementDashboard(createSource())

    expect(dashboard.products).toEqual([expect.objectContaining({ name: 'Produto novo', category: 'Galinha', returned: 16, returnPercentage: 20, mainReason: 'Avaria na entrega' })])
  })

  it('expõe o faturado e o retorno de cada motivo sem duplicar o faturado do produto', () => {
    const dashboard = calculateManagementDashboard(createSource())

    expect(dashboard.reasons).toEqual([expect.objectContaining({
      name: 'Avaria na entrega',
      billed: 200,
      returned: 28,
      percentage: 100,
    })])
  })

  it('ordena lojas pelo maior percentual de retorno e conta NFDs devolvidas', () => {
    const dashboard = calculateManagementDashboard(createSource())

    expect(dashboard.stores.map((store) => ({ name: store.name, returns: store.returns }))).toEqual([
      { name: 'Loja Nova', returns: 1 },
      { name: 'Loja Legado', returns: 1 },
      { name: 'Loja Pendente', returns: 0 },
    ])
  })

  it('usa faturado e retorno do mesmo FSTD legado apenas no card de lojas', () => {
    const dashboard = calculateManagementDashboard(createSource())

    expect(dashboard.allStores.find((store) => store.name === 'Loja Legado')).toEqual(expect.objectContaining({
      billed: 120,
      returned: 12,
      returnPercentage: 10,
    }))
    expect(dashboard.current.galinhaBilled).toBe(220)
    expect(dashboard.reasons.find((reason) => reason.name === 'Avaria na entrega')).toEqual(expect.objectContaining({ billed: 200 }))
  })

  it('inclui o faturamento das lojas filtradas mesmo quando não finalizadas', () => {
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
    expect(dashboard.allStores.find((store) => store.name === 'Loja Pendente')).toEqual(expect.objectContaining({ billed: 40, returned: 0 }))
  })

  it('mantém o faturamento das lojas quando não há NFD finalizada', () => {
    const source = createSource()
    source.current.notes = source.current.notes.map((note) => ({ ...note, status: 'Pendente' as const }))

    const dashboard = calculateManagementDashboard(source)

    expect(dashboard.stores).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Loja Legado', billed: 120, returned: 12 }),
      expect.objectContaining({ name: 'Loja Pendente', billed: 40, returned: 0 }),
    ]))
    expect(dashboard.allStores).toHaveLength(3)
  })

  it('trata NFD desconhecida como faturada, mas sem retorno apurado', () => {
    const source = createSource()
    source.current.notes = source.current.notes.map((note) => note.nota_fiscal === 12
      ? { ...note, status: 'Desconhecida' as const }
      : note)

    const dashboard = calculateManagementDashboard(source)

    expect(dashboard.current.financialTotal).toBe(700)
    expect(dashboard.current.galinhaBilled).toBe(220)
    expect(dashboard.current.returns).toMatchObject({ total: 28 })
    expect(dashboard.allStores.find((store) => store.name === 'Loja Pendente')).toEqual(expect.objectContaining({ billed: 40, returned: 0 }))
  })

  it('usa o retorno consolidado do relatório FSTD para as lojas', () => {
    const source = createSource()
    source.reports = [{
      nome_abreviado: 'Loja Nova',
      galinha_nfd: 80,
      codorna_nfd: 30,
      galinha_retorno: 16,
      codorna_retorno: 0,
    }]

    const dashboard = calculateManagementDashboard(source)

    expect(dashboard.allStores.find((store) => store.name === 'Loja Nova')).toEqual(expect.objectContaining({ billed: 110, returned: 16, returns: 1 }))
    expect(dashboard.allStores.find((store) => store.name === 'Loja Legado')).toEqual(expect.objectContaining({ billed: 120, returned: 12, returns: 1 }))
  })

  it('nunca permite retorno maior que faturado no card quando o legado contém dado inválido', () => {
    const source = createSource()
    source.legacy[0] = { ...source.legacy[0], qtd_total_galinha: 20, qtd_total_codorna: 0, qtd_retorno_galinha: 50, qtd_retorno_codorna: 0 }

    const dashboard = calculateManagementDashboard(source)
    const legacyStore = dashboard.allStores.find((store) => store.name === 'Loja Legado')

    expect(legacyStore).toEqual(expect.objectContaining({ billed: 20, returned: 20, returnPercentage: 100 }))
    expect(dashboard.allStores.every((store) => store.returned <= store.billed)).toBe(true)
  })
})
