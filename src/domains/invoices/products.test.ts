import { describe, expect, it } from 'vitest'
import { getNfdProducts, getNfdReturnRates, mergeNfdProducts } from './products'

describe('produtos e quantidades de NFD', () => {
  it('agrupa códigos vinculados ao mesmo produto e soma faturados', () => {
    const catalog = [{ codigo_produto: 'A', produto_id: 'p1', nome: 'Ovos' }, { codigo_produto: ' B ', produto_id: 'p1', nome: 'Ovos' }]
    const result = getNfdProducts({ detalhes: [{ codigo_produto: 'a', quantidade_galinha: 4 }, { codigo_produto: ' B ', quantidade_codorna: 6 }] }, catalog)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ codigos_produto: ['A', 'B'], quantidade_faturada_galinha: 4, quantidade_faturada_codorna: 6 })
  })
  it('mescla produto persistido sem duplicar o importado', () => {
    expect(mergeNfdProducts([{ produto_id: 'p1', codigo_produto: 'A', codigos_produto: ['A'], imagem_url: '' }], [{ produto_id: 'p1', codigo_produto: 'B', imagem_url: 'foto' }]))
      .toEqual([expect.objectContaining({ codigos_produto: ['A', 'B'], imagem_url: 'foto' })])
  })
  it('rateia devolução mista e limita percentuais entre zero e cem', () => {
    const rates = getNfdReturnRates({ quantidade_galinha: 8, quantidade_codorna: 2, produtos: [{ produto_id: 'p1', quantidade_faturada_galinha: 8, quantidade_faturada_codorna: 2 }], fstd_process: { produtos: [{ produto_id: 'p1', quantidade_retorno: 5 }] } })
    expect(rates).toEqual({ galinha: 50, codorna: 50 })
    expect(getNfdReturnRates({ quantidade_galinha: 1, produtos: [{ codigo_produto: 'A', quantidade_faturada_galinha: 1 }], fstd_process: { produtos: [{ codigo_produto: 'A', quantidade_retorno: 10 }] } }).galinha).toBe(100)
  })
})
