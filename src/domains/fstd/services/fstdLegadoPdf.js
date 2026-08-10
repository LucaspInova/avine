import legacyTemplate from '../../../../base-legado/template-pdf.html?raw'

export const FSTD_LEGADO_TEMPLATE_VERSION = 1

function escapeHtml(value) {
  return String(value ?? '-').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

export function generateLegacyFstdHtml({ record, store }) {
  const values = {
    id: record.id,
    data_preenchimento: formatDate(record.data_preenchimento),
    codigo_loja: store?.nome ? `${store.nome} (${record.codigo_loja})` : record.codigo_loja,
    responsavel_fstd: record.responsavel_fstd,
    motivo: record.motivo,
    numero_nfd: record.numero_nfd,
    qtd_total_galinha: record.qtd_total_galinha,
    qtd_retorno_galinha: record.qtd_retorno_galinha,
    qtd_total_codorna: record.qtd_total_codorna,
    qtd_retorno_codorna: record.qtd_retorno_codorna,
    'calcular-perdido-gal': Number(record.qtd_total_galinha ?? 0) - Number(record.qtd_retorno_galinha ?? 0),
    'calcular-perdido-cod': Number(record.qtd_total_codorna ?? 0) - Number(record.qtd_retorno_codorna ?? 0),
  }
  let html = legacyTemplate.replace('src\\shared\\assets\\foto_logoavine.png', '/src/shared/assets/foto_logoavine.png')
  for (const [key, value] of Object.entries(values)) html = html.replaceAll(`$${key}`, escapeHtml(value))
  return html.replace('<title>FSTD DIGITAL</title>', `<title>FSTD ${escapeHtml(record.id)}</title>`)
}

export function createLegacyFstdDocument(record, store) {
  const blob = new Blob([generateLegacyFstdHtml({ record, store })], { type: 'text/html;charset=utf-8' })
  return { controlNumber: record.id, url: URL.createObjectURL(blob), templateVersion: FSTD_LEGADO_TEMPLATE_VERSION }
}
