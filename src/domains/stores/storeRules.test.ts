import { describe, expect, it } from 'vitest'
import { isMesmoUf, normalizeUf, sortStoresByCode } from './storeRules'

describe('escopo e ordenação de lojas', () => {
  it('normaliza e restringe atribuição à UF do promotor', () => {
    expect(normalizeUf(' ce ')).toBe('CE')
    expect(isMesmoUf({ uf: 'CE' }, { estado: ' ce ' })).toBe(true)
    expect(isMesmoUf({ uf: 'PI' }, { estado: 'CE' })).toBe(false)
  })
  it('ordena códigos numericamente sem alterar a entrada', () => {
    const stores = [{ codigo: '10' }, { codigo: '2' }, { codigo: 'A1' }]
    expect(sortStoresByCode(stores).map((store) => store.codigo)).toEqual(['2', '10', 'A1'])
    expect(stores[0].codigo).toBe('10')
  })
})
