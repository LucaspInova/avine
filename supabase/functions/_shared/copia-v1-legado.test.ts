import { describe, expect, it } from 'vitest'
import {
  comparisonKey,
  normalizeCopiaV1Csv,
  planCopiaV1Sync,
  sourceHash,
} from './copia-v1-legado.ts'

const HEADER = 'NFD,FSTD,ID,Data de Emissão,Data da Baixa,Valor $,VL GALINHA,VL CODORNA,MOTORISTA,Motivo da Emissão,Nome Abreviado,Responsavel FSTD,GALINHA NFD,CODORNA NFD,GALINHA RETORNO,CODORNA RETORNO'
const VALID_ROW = '118911,810153,5677 - 118911,02/06/2026,14/07/2026,206.71,206.7,0,MALOTE,AVARIA NA ENTREGA,LOJA,RESPONSAVEL,350,0,350,0'

describe('COPIA V1 legado parser', () => {
  it('mapeia somente as colunas existentes em fstd_legado', () => {
    const result = normalizeCopiaV1Csv(`${HEADER}\n${VALID_ROW}`)

    expect(result.invalidRows).toEqual([])
    expect(result.records).toEqual([{
      codigo_loja: '5677',
      numero_nfd: '118911',
      id: '5677 - 118911',
      numero_controle: '810153',
      data_preenchimento: '2026-07-14T00:00:00.000Z',
      responsavel_fstd: 'RESPONSAVEL',
      motivo: 'AVARIA NA ENTREGA',
      qtd_total_galinha: 350,
      qtd_retorno_galinha: 350,
      qtd_total_codorna: 0,
      qtd_retorno_codorna: 0,
      origem: 'COPIA V1',
    }])
  })

  it('remove virgulas dos campos numericos antes de validar como inteiro', () => {
    const rowWithCommas = '118911,810153,5677 - 118911,02/06/2026,14/07/2026,206.71,206.7,0,MALOTE,AVARIA NA ENTREGA,LOJA,RESPONSAVEL,3,0,1,458'
    const result = normalizeCopiaV1Csv(`${HEADER}\n${rowWithCommas}`)

    expect(result.invalidRows).toEqual([])
    expect(result.records[0]).toMatchObject({
      qtd_total_galinha: 3,
      qtd_retorno_galinha: 1,
      qtd_retorno_codorna: 458,
    })
  })

  it('mantem a linha invalida fora da importacao quando ID e NFD divergem', () => {
    const result = normalizeCopiaV1Csv(`${HEADER}\n118911,810153,5677 - 999999,02/06/2026,14/07/2026,206.71,206.7,0,MALOTE,MOTIVO,LOJA,RESPONSAVEL,350,0,350,0`)

    expect(result.records).toEqual([])
    expect(result.invalidRows).toHaveLength(1)
    expect(result.invalidRows[0].error).toContain('nao confere')
  })

  it('gera hash estavel por conteudo e ocorrencia, sem usar a linha da planilha', async () => {
    const [record] = normalizeCopiaV1Csv(`${HEADER}\n${VALID_ROW}`).records

    expect(comparisonKey(record)).toContain('5677')
    await expect(sourceHash(record, 1)).resolves.toEqual(await sourceHash(record, 1))
    await expect(sourceHash(record, 1)).resolves.not.toEqual(await sourceHash(record, 2))
  })

  it('nao reinsere em reexecucao, mas preserva repeticoes legitimas', () => {
    const [record] = normalizeCopiaV1Csv(`${HEADER}\n${VALID_ROW}`).records
    const withDuplicate = [record, record]

    expect(planCopiaV1Sync(withDuplicate, [record]).recordsToInsert)
      .toEqual([{ record, occurrence: 2 }])
    expect(planCopiaV1Sync(withDuplicate, withDuplicate).recordsToInsert)
      .toEqual([])
  })

  it('marca como divergente o registro COPIA V1 ausente, sem programa-lo para exclusao', () => {
    const [record] = normalizeCopiaV1Csv(`${HEADER}\n${VALID_ROW}`).records
    const changedRecord = { ...record, numero_controle: 'OUTRO' }
    const plan = planCopiaV1Sync([record], [changedRecord])

    expect(plan.recordsToInsert).toEqual([{ record, occurrence: 1 }])
    expect(plan.divergentExisting).toEqual([changedRecord])
  })
})
