import { describe, expect, it, vi } from 'vitest'
import { createLegacyFstdDocument, legacyFstdLookupParams, legacyFstdPdfInput } from './fstdLegadoPdf'
import { generateFstdPdf, productRows } from './fstdPdf'

describe('FSTD PDF data mapping', () => {
  it('keeps chicken and quail quantities separate in the current model', () => {
    const rows = productRows({
      produtos: [{
        nome: 'Ovo selecionado',
        quantidade_faturada_galinha: 120,
        quantidade_faturada_codorna: 36,
        quantidade_retorno: 18,
        motivo_id: 'm1',
      }],
    }, new Map([['m1', 'Avaria']]))

    expect(rows).toEqual([expect.objectContaining({
      billedChicken: 120,
      billedQuail: 36,
      returned: 18,
      reasons: 'Avaria',
    })])
  })

  it('normalizes a legacy record into the same real-PDF contract', () => {
    const input = legacyFstdPdfInput({
      id: 'LEG-42',
      numero_nfd: '4567',
      codigo_loja: '1200',
      responsavel_fstd: 'Maria',
      motivo: 'Quebra',
      qtd_total_galinha: 100,
      qtd_retorno_galinha: 70,
      qtd_total_codorna: 40,
      qtd_retorno_codorna: 10,
    }, { codigo: '1200', nome: 'Loja central' })

    expect(input.document.numero_controle).toBe('LEG-42')
    expect(input.process.nfd_numero).toBe('4567')
    expect(input.process.produtos).toEqual([
      expect.objectContaining({
        nome: 'Caipira',
        quantidade_faturada_galinha: 100,
        quantidade_faturada_codorna: 0,
        quantidade_retorno_galinha: 70,
        quantidade_retorno_codorna: 0,
      }),
      expect.objectContaining({
        nome: 'Codorna',
        quantidade_faturada_galinha: 0,
        quantidade_faturada_codorna: 40,
        quantidade_retorno_galinha: 0,
        quantidade_retorno_codorna: 10,
      }),
    ])
    expect(input.nfd.nome_abreviado).toBe('Loja central')
  })

  it('finds the complete legacy record when the gerencial view only has a boolean flag', () => {
    expect(legacyFstdLookupParams({
      fstd_legado: true,
      codigo_cliente: 15777,
      nota_fiscal: 47195,
    }, { codigo: 'ignored' })).toEqual({
      p_codigo_loja: '15777',
      p_numero_nfd: '47195',
    })
  })

  it('generates a browser-openable PDF blob for the current model', async () => {
    const blob = await generateFstdPdf({
      document: { numero_controle: 100001 },
      process: {
        nfd_numero: '4567',
        finalizada_em: '2026-08-20T12:00:00Z',
        produtos: [{
          nome: 'Ovos tipo A',
          quantidade_faturada_galinha: 120,
          quantidade_faturada_codorna: 24,
          quantidade_retorno: 10,
          motivo_id: 'm1',
          fotos: [],
        }],
      },
      nfd: { nota_fiscal: '4567', nome_abreviado: 'Loja central', codigo_cliente: '1200' },
      store: { codigo: '1200', nome: 'Loja central' },
      responsible: 'Maria',
      motivos: [{ id: 'm1', nome: 'Avaria' }],
    })

    expect(blob.type).toBe('application/pdf')
    const bytes = await blob.arrayBuffer()
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF')

    if (globalThis.process?.env?.WRITE_FSTD_PDF_SAMPLE === '1') {
      const { mkdir, writeFile } = await import('node:fs/promises')
      await mkdir('output/pdf', { recursive: true })
      await writeFile('output/pdf/fstd-modelo-novo-amostra.pdf', new Uint8Array(bytes))
    }
  })

  it('generates a real PDF blob for the legacy model too', async () => {
    let generatedBlob
    const createObjectURL = vi.fn((blob) => {
      generatedBlob = blob
      return 'blob:legacy-fstd'
    })
    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = createObjectURL

    try {
      const document = await createLegacyFstdDocument({
        id: 'LEG-7',
        numero_nfd: '4567',
        codigo_loja: '1200',
        responsavel_fstd: 'Maria',
        motivo: 'Avaria',
        qtd_total_galinha: 50,
        qtd_retorno_galinha: 20,
        qtd_total_codorna: 12,
        qtd_retorno_codorna: 4,
      }, { codigo: '1200', nome: 'Loja central' })

      expect(document).toEqual(expect.objectContaining({ controlNumber: 'LEG-7', url: 'blob:legacy-fstd' }))
      expect(generatedBlob.type).toBe('application/pdf')
      const bytes = await generatedBlob.arrayBuffer()
      expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF')

      if (globalThis.process?.env?.WRITE_LEGACY_FSTD_PDF_SAMPLE === '1') {
        const { mkdir, writeFile } = await import('node:fs/promises')
        await mkdir('output/pdf', { recursive: true })
        await writeFile('output/pdf/fstd-modelo-legado-amostra.pdf', new Uint8Array(bytes))
      }
    } finally {
      URL.createObjectURL = originalCreateObjectURL
    }
  })
})
