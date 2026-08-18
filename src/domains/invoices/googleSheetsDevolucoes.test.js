import { describe, expect, it, vi } from 'vitest'
import { insertOnlyNewItems } from '../../../supabase/functions/_shared/devolucoes-sync'
import {
  normalizeSheetCsv,
  parseCsv,
  parseSheetDate,
} from '../../../supabase/functions/_shared/google-sheets-devolucoes'

const header = [
  'Estab',
  'NFD',
  'Data Emissão',
  'Cod Cli',
  'Nome Abrev',
  'Cidade',
  'UF',
  'Item Avine',
  'Descricao do Item Avine',
  'Quant. Galinha',
  'Quant Codorna',
  'Valor Galinha',
  'Valor Codorna',
  'CHAVE',
].map((value) => `"${value}"`).join(',')

const accessKey = '23250139346861017307550010001959581889399219'

describe('normalização da aba Itens da Devolução', () => {
  it('interpreta CSV com vírgulas e aspas escapadas', () => {
    expect(parseCsv('"A","Descrição, com ""aspas"""\n1,2')).toEqual([
      ['A', 'Descrição, com "aspas"'],
      ['1', '2'],
    ])
  })

  it('aceita as datas exibidas pela planilha e rejeita datas inválidas', () => {
    expect(parseSheetDate('15/08/26')).toBe('2026-08-15')
    expect(parseSheetDate('15/08/2026')).toBe('2026-08-15')
    expect(() => parseSheetDate('31/02/26')).toThrow('Data de emissão inválida')
  })

  it('agrega linhas da mesma chave/produto e ignora placeholders inválidos', () => {
    const csv = [
      header,
      `"1","8945","15/08/26","18994","GUARA","Fortaleza","ce","10PA05.016GD04","Produto, teste","300","0","210","0","${accessKey}"`,
      `"1","8945","15/08/26","18994","GUARA","Fortaleza","CE","10PA05.016GD04","Produto, teste","80","0","56","0","${accessKey}"`,
      '"0","1","15/08/26","0","TROCA","0","0","TROCA","TROCA","1000000","1000000","0","0","#N/D"',
    ].join('\n')

    const result = normalizeSheetCsv(csv, '2026-08-18T12:00:00.000Z')

    expect(result.receivedCount).toBe(3)
    expect(result.validRowCount).toBe(2)
    expect(result.duplicateCount).toBe(1)
    expect(result.invalidItems).toHaveLength(1)
    expect(result.items).toEqual([
      expect.objectContaining({
        quantidade_galinha: 380,
        quantidade_codorna: 0,
        valor_galinha: 266,
        valor_codorna: 0,
        valor: 266,
        data_emissao: '2026-08-15',
        data_referencia: '2026-08-15',
        uf: 'CE',
      }),
    ])
  })

  it('usa conflito DO NOTHING e conta somente linhas realmente inseridas', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: 10 }], error: null })
    const upsert = vi.fn(() => ({ select }))
    const supabase = { from: vi.fn(() => ({ upsert })) }
    const items = [{ chave_acesso: accessKey, codigo_produto: 'PRODUTO' }]

    await expect(insertOnlyNewItems(supabase, items)).resolves.toEqual({
      insertedCount: 1,
      batchCount: 1,
    })
    expect(upsert).toHaveBeenCalledWith(items, {
      onConflict: 'chave_acesso,codigo_produto',
      ignoreDuplicates: true,
    })
    expect(select).toHaveBeenCalledWith('id')
  })
})
