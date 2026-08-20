import { generateFstdPdf } from './fstdPdf'

export const FSTD_LEGADO_TEMPLATE_VERSION = 2

export function legacyFstdLookupParams(target, store) {
  const legacy = target?.fstd_legado
  const codigoLoja = legacy?.codigo_loja ?? target?.loja_codigo ?? target?.codigo_cliente ?? store?.codigo
  const numeroNfd = legacy?.numero_nfd ?? target?.nota_fiscal ?? target?.numero

  if (codigoLoja === null || codigoLoja === undefined || numeroNfd === null || numeroNfd === undefined) {
    throw new Error('Não foi possível identificar a loja e a NFD da FSTD legada.')
  }

  return {
    p_codigo_loja: String(codigoLoja).trim(),
    p_numero_nfd: String(numeroNfd).trim(),
  }
}

export function legacyFstdPdfInput(record, store) {
  const controlNumber = record.numero_controle ?? record.id
  const process = {
    nfd_numero: record.numero_nfd,
    finalizada_em: record.data_preenchimento,
    produtos: [{
      codigo_produto: 'LEGADO-CAIPIRA',
      nome: 'Caipira',
      quantidade_faturada_galinha: Number(record.qtd_total_galinha ?? 0),
      quantidade_faturada_codorna: 0,
      quantidade_retorno_galinha: Number(record.qtd_retorno_galinha ?? 0),
      quantidade_retorno_codorna: 0,
      motivo_id: null,
      observacao: `Perda no cliente: ${Number(record.qtd_total_galinha ?? 0) - Number(record.qtd_retorno_galinha ?? 0)}.`,
      fotos: [],
    }, {
      codigo_produto: 'LEGADO-CODORNA',
      nome: 'Codorna',
      quantidade_faturada_galinha: 0,
      quantidade_faturada_codorna: Number(record.qtd_total_codorna ?? 0),
      quantidade_retorno_galinha: 0,
      quantidade_retorno_codorna: Number(record.qtd_retorno_codorna ?? 0),
      motivo_id: null,
      observacao: `Perda no cliente: ${Number(record.qtd_total_codorna ?? 0) - Number(record.qtd_retorno_codorna ?? 0)}.`,
      fotos: [],
    }],
  }

  return {
    document: { numero_controle: controlNumber },
    process,
    nfd: {
      nota_fiscal: record.numero_nfd,
      codigo_cliente: record.codigo_loja ?? store?.codigo,
      nome_abreviado: store?.nome,
    },
    store: store ?? { codigo: record.codigo_loja },
    responsible: record.responsavel_fstd,
    motivos: record.motivo ? [{ id: '__legacy__', nome: record.motivo }] : [],
    photoUrls: [],
  }
}

export async function createLegacyFstdDocument(record, store) {
  const input = legacyFstdPdfInput(record, store)
  input.process.produtos.forEach((product) => {
    product.motivo_id = input.motivos[0]?.id ?? null
  })
  const blob = await generateFstdPdf(input)
  return { controlNumber: input.document.numero_controle, url: URL.createObjectURL(blob), templateVersion: FSTD_LEGADO_TEMPLATE_VERSION }
}
