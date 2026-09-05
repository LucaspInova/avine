import avineLogo from '../../../shared/assets/foto_logoavine.png'
import infoIcon from '../../../shared/assets/fstd-icons/informacoes.png'
import truckIcon from '../../../shared/assets/fstd-icons/lado-do-caminhao.png'
import storeIcon from '../../../shared/assets/fstd-icons/loja-alt.png'

const GREEN = [35, 105, 28]
const LIGHT_GREEN = [235, 241, 232]
const GREY = [100, 105, 100]
const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
export const FSTD_PDF_TEMPLATE_VERSION = 9

function asText(value, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function asNumber(value) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function cleanObservation(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*Fotos selecionadas\s*:/i.test(line))
    .join('\n')
    .trim()
}

function formatDate(value, withTime = false) {
  if (!value) return '-'
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return asText(value)

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

function setIconStyle(pdf, color = GREEN) {
  pdf.setDrawColor(...color)
  pdf.setLineWidth(0.8)
  pdf.setLineCap('round')
  pdf.setLineJoin('round')
}

function drawIcon(pdf, type, x, y, size = 7, color = GREEN) {
  setIconStyle(pdf, color)
  const half = size / 2

  if (type === 'calendar') {
    pdf.roundedRect(x, y + 1, size, size - 1, 1, 1, 'S')
    pdf.line(x + 1, y + 3, x + size - 1, y + 3)
    pdf.line(x + 2, y, x + 2, y + 2)
    pdf.line(x + size - 2, y, x + size - 2, y + 2)
    ;[4.5, 6.5].forEach((row) => {
      ;[2.2, 4.5].forEach((column) => pdf.circle(x + column, y + row, 0.25, 'S'))
    })
    return
  }

  if (type === 'person') {
    pdf.circle(x + half, y + 2, 1.8, 'S')
    pdf.line(x + half - 3.5, y + size + 4, x + half - 3.5, y + size + 2.5)
    pdf.line(x + half - 3.5, y + size + 2.5, x + half - 2.3, y + size + 1.2)
    pdf.line(x + half - 2.3, y + size + 1.2, x + half + 2.3, y + size + 1.2)
    pdf.line(x + half + 2.3, y + size + 1.2, x + half + 3.5, y + size + 2.5)
    pdf.line(x + half + 3.5, y + size + 2.5, x + half + 3.5, y + size + 4)
    return
  }

  if (type === 'barcode') {
    ;[0, 1.4, 2.5, 4.2, 5.2, 6.8].forEach((offset, index) => {
      pdf.setLineWidth(index % 2 === 0 ? 1 : 0.45)
      pdf.line(x + offset, y, x + offset, y + size)
    })
    return
  }

  if (type === 'store') {
    pdf.rect(x + 1, y + 3, size - 2, size - 3, 'S')
    pdf.line(x, y + 3, x + size, y + 3)
    pdf.line(x + 1, y + 3, x + 2, y + 1)
    pdf.line(x + 2, y + 1, x + size - 2, y + 1)
    pdf.line(x + size - 2, y + 1, x + size, y + 3)
    pdf.line(x + half, y + 5, x + half, y + size)
    return
  }

  if (type === 'store-lock') {
    pdf.rect(x + 1, y + 3, size - 2, size - 3, 'S')
    pdf.line(x, y + 3, x + size, y + 3)
    pdf.line(x + 1, y + 3, x + 2, y + 1)
    pdf.line(x + 2, y + 1, x + size - 2, y + 1)
    pdf.line(x + size - 2, y + 1, x + size, y + 3)
    pdf.roundedRect(x + 3.8, y + 4.4, 3.4, 3.1, 0.6, 0.6, 'S')
    pdf.line(x + 4.5, y + 4.7, x + 4.5, y + 3.8)
    pdf.line(x + 4.5, y + 3.8, x + 6.5, y + 3.8)
    pdf.line(x + 6.5, y + 3.8, x + 6.5, y + 4.7)
    return
  }

  if (type === 'menu-burger') {
    ;[1.5, 4.2, 6.9].forEach((offset) => pdf.line(x, y + offset, x + size, y + offset))
    return
  }

  if (type === 'info') {
    pdf.circle(x + half, y + half, half - 0.5, 'S')
    pdf.circle(x + half, y + 2, 0.4, 'F')
    pdf.line(x + half, y + 3.3, x + half, y + size - 1.2)
    return
  }

  if (type === 'cube') {
    pdf.line(x + half, y, x + size, y + 2)
    pdf.line(x + size, y + 2, x + size, y + 6)
    pdf.line(x + size, y + 6, x + half, y + size)
    pdf.line(x + half, y + size, x, y + 6)
    pdf.line(x, y + 6, x, y + 2)
    pdf.line(x, y + 2, x + half, y)
    pdf.line(x + half, y, x + half, y + 4)
    pdf.line(x + half, y + 4, x + size, y + 2)
    pdf.line(x + half, y + 4, x, y + 2)
    return
  }

  if (type === 'camera') {
    pdf.roundedRect(x, y + 2, size, size - 2, 1, 1, 'S')
    pdf.line(x + 2, y + 2, x + 3, y)
    pdf.line(x + 3, y, x + 5, y)
    pdf.circle(x + half, y + 5, 1.6, 'S')
    return
  }

  if (type === 'truck') {
    pdf.line(x - 2.5, y + 3, x - 0.5, y + 3)
    pdf.line(x - 1.5, y + 5, x + 0.5, y + 5)
    pdf.rect(x, y + 2, 5, 4, 'S')
    pdf.line(x + 5, y + 3, x + 7, y + 3)
    pdf.line(x + 7, y + 3, x + 7, y + 6)
    pdf.line(x + 5, y + 6, x + 7, y + 6)
    pdf.circle(x + 2, y + 7, 0.9, 'S')
    pdf.circle(x + 6, y + 7, 0.9, 'S')
  }
}

function addInfoField(pdf, { icon, iconDataUrl, label, value, x, y, width }) {
  if (iconDataUrl) {
    pdf.addImage(iconDataUrl, 'PNG', x, y - 4, 8, 8, undefined, 'FAST')
  } else {
    drawIcon(pdf, icon, x, y - 3, 7)
  }
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(...GREY)
  pdf.text(label.toUpperCase(), x + 12, y)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(25, 28, 25)
  const lines = pdf.splitTextToSize(asText(value), width - 12)
  pdf.text(lines.slice(0, 2), x + 12, y + 5)
}

function addMotivoRow(pdf, reasons) {
  drawIcon(pdf, 'menu-burger', 13, 89, 7)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(...GREY)
  pdf.text('MOTIVO(S)', 25, 94)

  const visibleReasons = reasons.length > 0 ? reasons : ['Motivo não informado']
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  const availableWidth = 203 - 49
  const gap = 4
  const maxChipWidth = Math.max(24, (availableWidth - gap * (visibleReasons.length - 1)) / visibleReasons.length)
  const widths = visibleReasons.map((reason) => Math.min(maxChipWidth, pdf.getTextWidth(reason) + 10))
  let cursor = 49

  visibleReasons.forEach((reason, index) => {
    const width = widths[index]
    pdf.setFillColor(...LIGHT_GREEN)
    pdf.roundedRect(cursor, 88.5, width, 8, 3, 3, 'F')
    pdf.setTextColor(...GREEN)
    const label = pdf.splitTextToSize(reason, width - 8)[0]
    pdf.text(label, cursor + width / 2, 93.7, { align: 'center' })
    cursor += width + gap
  })
}

function addSectionTitle(pdf, title, icon, x, y, iconDataUrl = null) {
  if (iconDataUrl) {
    pdf.addImage(iconDataUrl, 'PNG', x, y, 10, 10, undefined, 'FAST')
  } else {
    drawIcon(pdf, icon, x + 1, y + 1, 8, GREEN)
  }
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...GREEN)
  pdf.text(title.toUpperCase(), x + 14, y + 6.5)
}

async function getLogoDataUrl() {
  return getImageDataUrl(avineLogo)
}

async function getImageDataUrl(url) {
  if (!url) return null
  if (/^data:image\//i.test(url)) return url

  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export function productRows(process, motivosById) {
  const aggregate = process?.modo_coleta === 'agregado' ? process?.resumo_agregado : null
  const products = aggregate
    ? [{
      nome: 'Totais da nota',
      quantidade_faturada_galinha: aggregate.quantidade_faturada_galinha,
      quantidade_faturada_codorna: aggregate.quantidade_faturada_codorna,
      quantidade_retorno_galinha: aggregate.quantidade_retorno_galinha,
      quantidade_retorno_codorna: aggregate.quantidade_retorno_codorna,
      motivo_id: aggregate.motivo_id,
      observacao: aggregate.observacao,
    }]
    : (process?.produtos ?? [])

  return products.map((product) => {
    const divisions = Array.isArray(product.divisoes) ? product.divisoes : []
    const reasons = divisions.length > 0
      ? divisions.map((division) => motivosById.get(division.motivo_id) ?? 'Motivo não informado').join(', ')
      : (motivosById.get(product.motivo_id) ?? 'Motivo não informado')

    return {
      name: asText(product.nome || product.descricao || product.codigo_produto),
      billedChicken: asNumber(product.quantidade_faturada_galinha ?? product.qtd_total_galinha),
      billedQuail: asNumber(product.quantidade_faturada_codorna ?? product.qtd_total_codorna),
      returnedChicken: asNumber(product.quantidade_retorno_galinha ?? product.qtd_retorno_galinha),
      returnedQuail: asNumber(product.quantidade_retorno_codorna ?? product.qtd_retorno_codorna),
      returned: asNumber(product.quantidade_retorno),
      reasons,
      observation: cleanObservation(product.observacao),
    }
  })
}

/**
 * Builds the immutable PDF for one completed FSTD. All values come from the
 * Supabase snapshot passed by the caller; this function does not query or
 * invent operational data.
 */
export async function generateFstdPdf({ document, process, nfd, store, responsible, createdBy, updatedBy, motivos = [] }) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const contentWidth = PAGE_WIDTH - 14
  const motivosById = new Map(motivos.map((motivo) => [motivo.id, motivo.nome]))
  const rows = productRows(process, motivosById)
  const reasons = [...new Set(rows.flatMap((row) => row.reasons.split(', ').filter(Boolean)))]

  pdf.setProperties({
    title: `FSTD ${document?.numero_controle ?? process?.nfd_numero ?? nfd?.nota_fiscal ?? '-'}`,
    subject: 'Formulário de Solicitação de Trocas e Devoluções',
    creator: 'Avine FSTD Digital',
  })

  pdf.setDrawColor(185, 200, 185)
  pdf.setLineWidth(0.35)
  pdf.roundedRect(4, 4, PAGE_WIDTH - 8, PAGE_HEIGHT - 8, 3, 3, 'S')

  const [logo, infoIconData, truckIconData, storeIconData] = await Promise.all([
    getLogoDataUrl(),
    getImageDataUrl(infoIcon),
    getImageDataUrl(truckIcon),
    getImageDataUrl(storeIcon),
  ])
  // The source is a square canvas with transparent padding. Keeping the image
  // square preserves the logo proportions while the visible mark fills this
  // same visual area as the supplied reference.
  if (logo) {
    const logoBox = { x: 8, y: 7, width: 48, height: 48 }
    const logoSize = Math.min(logoBox.width, logoBox.height)
    pdf.addImage(
      logo,
      'PNG',
      logoBox.x + (logoBox.width - logoSize) / 2,
      logoBox.y + (logoBox.height - logoSize) / 2,
      logoSize,
      logoSize,
      undefined,
      'FAST',
    )
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(22)
  pdf.setTextColor(...GREEN)
  pdf.text('FSTD DIGITAL', 62, 20)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(45, 48, 45)
  pdf.text('Formulário de Solicitação de', 62, 27)
  pdf.text('Trocas e Devoluções', 62, 33)

  pdf.setFillColor(...GREEN)
  pdf.roundedRect(145, 8, 58, 8, 2, 2, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(255, 255, 255)
  pdf.text('NÚMERO DE CONTROLE', 174, 13.2, { align: 'center' })
  pdf.setDrawColor(...GREEN)
  pdf.roundedRect(145, 16, 58, 16, 2, 2, 'S')
  pdf.setFontSize(19)
  pdf.setTextColor(210, 26, 70)
  pdf.text(String(document?.numero_controle ?? '-'), 174, 27, { align: 'center' })

  pdf.setDrawColor(205, 215, 205)
  pdf.line(7, 42, 203, 42)

  pdf.roundedRect(7, 46, contentWidth, 56, 3, 3, 'S')
  pdf.line(7, 69, 203, 69)
  pdf.line(70, 50, 70, 69)
  pdf.line(137, 50, 137, 69)
  pdf.line(70, 73, 70, 85)
  pdf.line(137, 73, 137, 85)
  pdf.line(7, 85, 203, 85)

  addInfoField(pdf, {
    icon: 'calendar',
    label: 'Data da FSTD',
    value: formatDate(process?.data_entrega ?? process?.finalizada_em ?? nfd?.data_entrega ?? nfd?.data_emissao),
    x: 13,
    y: 56,
    width: 53,
  })
  addInfoField(pdf, {
    icon: 'person',
    label: 'Cliente requisitante',
    value: nfd?.nome_abreviado ?? store?.nome,
    x: 77,
    y: 56,
    width: 55,
  })
  addInfoField(pdf, {
    icon: 'person',
    label: 'Responsável Avine',
    value: updatedBy && createdBy && updatedBy !== createdBy
      ? `${updatedBy} (criado por ${createdBy})`
      : (responsible ?? updatedBy ?? createdBy),
    x: 144,
    y: 56,
    width: 54,
  })
  addInfoField(pdf, {
    icon: 'barcode',
    label: 'Nº da NFD',
    value: process?.nfd_numero ?? nfd?.nota_fiscal ?? nfd?.numero,
    x: 13,
    y: 78,
    width: 53,
  })
  addInfoField(pdf, {
    icon: 'store-lock',
    iconDataUrl: storeIconData,
    label: 'Código da loja',
    value: store?.codigo ?? nfd?.codigo_cliente,
    x: 77,
    y: 78,
    width: 55,
  })
  addMotivoRow(pdf, reasons)

  addSectionTitle(pdf, 'Dados para coleta', 'info', 8, 107, infoIconData)
  const tableY = 117
  const tableX = 7
  const columns = [
    { label: 'PRODUTO', x: tableX, width: 42 },
    { label: 'FATURADO\nGALINHA', x: tableX + 42, width: 25 },
    { label: 'FATURADO\nCODORNA', x: tableX + 67, width: 25 },
    { label: 'RETORNO\nTOTAL', x: tableX + 92, width: 24 },
    { label: 'MOTIVO', x: tableX + 116, width: 40 },
    { label: 'OBSERVAÇÃO', x: tableX + 156, width: contentWidth - 156 },
  ]
  const rowHeight = 8.7
  const maxRows = Math.max(10, rows.length)

  pdf.setFillColor(...GREEN)
  pdf.roundedRect(tableX, tableY, contentWidth, 8, 2, 2, 'F')
  pdf.rect(tableX, tableY + 4, contentWidth, 4, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6.5)
  pdf.setTextColor(255, 255, 255)
  columns.forEach((column) => {
    const labels = String(column.label).split('\n')
    pdf.text(labels, column.x + column.width / 2, labels.length > 1 ? tableY + 3.2 : tableY + 5.2, { align: 'center' })
  })

  pdf.setDrawColor(220, 225, 220)
  pdf.setLineWidth(0.25)
  for (let index = 0; index < maxRows; index += 1) {
    const y = tableY + 8 + index * rowHeight
    if (index % 2 === 0) {
      pdf.setFillColor(249, 251, 249)
      pdf.rect(tableX, y, contentWidth, rowHeight, 'F')
    }
    pdf.rect(tableX, y, contentWidth, rowHeight, 'S')
    columns.slice(1).forEach((column) => pdf.line(column.x, y, column.x, y + rowHeight))
    const row = rows[index]
    if (!row) continue

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(30, 34, 30)
    pdf.setFillColor(...GREEN)
    pdf.circle(columns[0].x + 6, y + rowHeight / 2, 2.5, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(6.5)
    pdf.setTextColor(255, 255, 255)
    pdf.text(String(index + 1), columns[0].x + 6, y + rowHeight / 2, { align: 'center', baseline: 'middle' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(30, 34, 30)
    pdf.text(pdf.splitTextToSize(row.name, columns[0].width - 15)[0], columns[0].x + 12, y + 5.5)
    pdf.text(String(row.billedChicken), columns[1].x + columns[1].width / 2, y + 5.7, { align: 'center' })
    pdf.text(String(row.billedQuail), columns[2].x + columns[2].width / 2, y + 5.7, { align: 'center' })
    const returned = row.returnedChicken + row.returnedQuail || row.returned
    pdf.text(String(returned), columns[3].x + columns[3].width / 2, y + 5.7, { align: 'center' })
    pdf.text(pdf.splitTextToSize(row.reasons, columns[4].width - 5)[0], columns[4].x + 3, y + 5.7)
    pdf.text(pdf.splitTextToSize(row.observation, columns[5].width - 5)[0], columns[5].x + 3, y + 5.7)
  }

  const logisticsY = 219
  addSectionTitle(pdf, 'Reservado para recebimento', 'truck', 8, logisticsY, truckIconData)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(...GREY)
  pdf.text('Motorista', 14, logisticsY + 16)
  pdf.line(38, logisticsY + 17, 96, logisticsY + 17)
  pdf.text('Qtde recolhida', 14, logisticsY + 26)
  pdf.line(40, logisticsY + 27, 96, logisticsY + 27)
  pdf.text('Data recolhimento', 14, logisticsY + 36)
  pdf.line(43, logisticsY + 37, 96, logisticsY + 37)
  pdf.setDrawColor(205, 215, 205)
  pdf.roundedRect(8, logisticsY + 10, 92, 34, 2, 2, 'S')
  pdf.line(12, logisticsY + 21, 96, logisticsY + 21)
  pdf.line(12, logisticsY + 31, 96, logisticsY + 31)

  addSectionTitle(pdf, 'Reservado para triagem', 'menu-burger', 108, logisticsY)
  pdf.setDrawColor(205, 215, 205)
  pdf.roundedRect(108, logisticsY + 10, 95, 34, 2, 2, 'S')
  pdf.setFontSize(6.5)
  pdf.text('Resp. triagem', 114, logisticsY + 16)
  pdf.line(143, logisticsY + 17, 199, logisticsY + 17)
  pdf.text('Qtde íntegros', 114, logisticsY + 26)
  pdf.line(143, logisticsY + 27, 199, logisticsY + 27)
  pdf.text('Qtde íntegros (codorna)', 114, logisticsY + 36)
  pdf.line(158, logisticsY + 37, 199, logisticsY + 37)

  const footerY = 288
  pdf.setFillColor(...LIGHT_GREEN)
  pdf.roundedRect(7, footerY, contentWidth, 6, 4, 4, 'F')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(...GREEN)
  pdf.text('Este formulário é um documento interno da Avine e deve ser preenchido de forma legível e completa.', 105, footerY + 4, { align: 'center' })

  return pdf.output('blob')
}
