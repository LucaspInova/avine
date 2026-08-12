import type {
  DashboardCatalogProduct,
  DashboardFstdProcess,
  DashboardFstdProduct,
  DashboardLegacyFstd,
  DashboardNote,
  DashboardProductReason,
  DashboardReason,
  DashboardStore,
  ManagementDashboardSource,
} from './types'

const DAY = 86400000

type ReturnTotals = { galinha: number; codorna: number; total: number; unresolved: number; count: number }

function numberValue(value: number | null | undefined) {
  return Number(value ?? 0)
}

function noteKey(note: Pick<DashboardNote, 'codigo_cliente' | 'nota_fiscal'>) {
  return `${note.codigo_cliente ?? ''}:${note.nota_fiscal ?? ''}`
}

function effectiveDate(note: DashboardNote) {
  return String(note.data_emissao ?? note.data_referencia ?? '').slice(0, 10)
}

function safeAverage(values: number[]) {
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length
}

function percentageChange(value: number, previous: number) {
  if (previous <= 0) return { direction: 'neutral' as const, value: 0 }
  const change = ((value - previous) / previous) * 100
  return {
    direction: change > 0 ? 'up' as const : change < 0 ? 'down' as const : 'neutral' as const,
    value: Math.abs(change),
  }
}

function createDataIndex(source: ManagementDashboardSource) {
  const processByAccessKey = new Map<string, DashboardFstdProcess>()
  source.processes.forEach((process) => {
    if (!process.is_avulsa && process.status === 'concluida') processByAccessKey.set(process.nfd_chave_acesso, process)
  })

  const productsByProcess = new Map<string, DashboardFstdProduct[]>()
  source.products.forEach((product) => {
    const products = productsByProcess.get(product.processo_id) ?? []
    products.push(product)
    productsByProcess.set(product.processo_id, products)
  })

  const reasonsByProduct = new Map<string, DashboardProductReason[]>()
  source.productReasons.forEach((reason) => {
    const reasons = reasonsByProduct.get(reason.produto_id) ?? []
    reasons.push(reason)
    reasonsByProduct.set(reason.produto_id, reasons)
  })

  const legacyByNote = new Map<string, DashboardLegacyFstd>()
  source.legacy.forEach((legacy) => {
    const key = `${legacy.codigo_loja}:${legacy.numero_nfd}`
    const current = legacyByNote.get(key)
    if (!current || legacy.legado_id < current.legado_id) legacyByNote.set(key, legacy)
  })

  return {
    processByAccessKey,
    productsByProcess,
    reasonsByProduct,
    legacyByNote,
    reasonNameById: new Map(source.reasons.map((reason) => [reason.id, reason.nome])),
    catalogById: new Map(source.catalogProducts.map((product) => [product.id, product])),
  }
}

function getNoteReturn(note: DashboardNote, index: ReturnType<typeof createDataIndex>) {
  if (note.status !== 'Finalizada') return { galinha: 0, codorna: 0, total: 0, unresolved: 0, count: 0, duration: null as number | null, source: 'none' as const }
  const legacy = index.legacyByNote.get(noteKey(note))
  if (legacy) {
    const galinha = numberValue(legacy.qtd_retorno_galinha)
    const codorna = numberValue(legacy.qtd_retorno_codorna)
    const completedAt = String(legacy.data_preenchimento ?? '').slice(0, 10)
    const issuedAt = effectiveDate(note)
    const duration = completedAt && issuedAt ? Math.max(0, Math.round((Date.parse(`${completedAt}T00:00:00Z`) - Date.parse(`${issuedAt}T00:00:00Z`)) / DAY)) : null
    return { galinha, codorna, total: galinha + codorna, unresolved: 0, count: galinha + codorna > 0 ? 1 : 0, duration, source: 'legacy' as const }
  }

  const process = note.chave_acesso ? index.processByAccessKey.get(note.chave_acesso) : undefined
  if (!process) return { galinha: 0, codorna: 0, total: 0, unresolved: 0, count: 0, duration: null as number | null, source: 'none' as const }
  const products = index.productsByProcess.get(process.id) ?? []
  const result = products.reduce((totals, product) => {
    const returned = numberValue(product.quantidade_retorno)
    const galinhaBilled = numberValue(product.quantidade_faturada_galinha)
    const codornaBilled = numberValue(product.quantidade_faturada_codorna)
    totals.total += returned
    if (returned > 0 && galinhaBilled > 0 && codornaBilled === 0) totals.galinha += returned
    else if (returned > 0 && codornaBilled > 0 && galinhaBilled === 0) totals.codorna += returned
    else if (returned > 0) totals.unresolved += returned
    return totals
  }, { galinha: 0, codorna: 0, total: 0, unresolved: 0 })
  const issuedAt = effectiveDate(note)
  const completedAt = String(process.finalizada_em ?? '').slice(0, 10)
  const duration = completedAt && issuedAt ? Math.max(0, Math.round((Date.parse(`${completedAt}T00:00:00Z`) - Date.parse(`${issuedAt}T00:00:00Z`)) / DAY)) : null
  return { ...result, count: result.total > 0 ? 1 : 0, duration, source: 'modern' as const }
}

function buildPeriodSummary(notes: DashboardNote[], index: ReturnType<typeof createDataIndex>) {
  const status = { Finalizada: 0, Pendente: 0, Desconhecida: 0 }
  const returns: ReturnTotals = { galinha: 0, codorna: 0, total: 0, unresolved: 0, count: 0 }
  const durations: number[] = []
  let financialTotal = 0
  let galinhaBilled = 0
  let codornaBilled = 0

  notes.forEach((note) => {
    status[note.status] += 1
    financialTotal += numberValue(note.valor_total)
    galinhaBilled += numberValue(note.quantidade_galinha)
    codornaBilled += numberValue(note.quantidade_codorna)
    const noteReturn = getNoteReturn(note, index)
    returns.galinha += noteReturn.galinha
    returns.codorna += noteReturn.codorna
    returns.total += noteReturn.total
    returns.unresolved += noteReturn.unresolved
    returns.count += noteReturn.count
    if (noteReturn.duration !== null) durations.push(noteReturn.duration)
  })

  return {
    totalNfds: notes.length,
    status,
    financialTotal,
    ticketAverage: notes.length > 0 ? financialTotal / notes.length : null,
    galinhaBilled,
    codornaBilled,
    returns,
    averageDays: safeAverage(durations),
  }
}

function buildProducts(notes: DashboardNote[], index: ReturnType<typeof createDataIndex>) {
  const rows = new Map<string, { name: string; category: string; returned: number; billed: number; reasons: Map<string, number> }>()
  notes.forEach((note) => {
    if (note.status !== 'Finalizada' || !note.chave_acesso || index.legacyByNote.has(noteKey(note))) return
    const process = index.processByAccessKey.get(note.chave_acesso)
    if (!process) return
    ;(index.productsByProcess.get(process.id) ?? []).forEach((product) => {
      const catalog = product.produto_id ? index.catalogById.get(product.produto_id) : undefined
      const key = product.produto_id ?? product.codigo_produto
      const row = rows.get(key) ?? {
        name: catalog?.nome?.trim() || product.nome || product.codigo_produto,
        category: catalog?.categoria?.trim() || 'Não categorizado',
        returned: 0,
        billed: 0,
        reasons: new Map<string, number>(),
      }
      row.returned += numberValue(product.quantidade_retorno)
      row.billed += numberValue(product.quantidade_faturada_galinha) + numberValue(product.quantidade_faturada_codorna)
      const divisions = index.reasonsByProduct.get(product.id) ?? []
      if (divisions.length > 0) {
        divisions.forEach((division) => row.reasons.set(
          index.reasonNameById.get(division.motivo_id) ?? 'Motivo não informado',
          (row.reasons.get(index.reasonNameById.get(division.motivo_id) ?? 'Motivo não informado') ?? 0) + numberValue(division.quantidade),
        ))
      } else if (product.motivo_id) {
        const reason = index.reasonNameById.get(product.motivo_id) ?? 'Motivo não informado'
        row.reasons.set(reason, (row.reasons.get(reason) ?? 0) + numberValue(product.quantidade_retorno))
      }
      rows.set(key, row)
    })
  })

  return [...rows.values()]
    .filter((row) => row.returned > 0)
    .map((row) => ({
      ...row,
      returnPercentage: row.billed > 0 ? (row.returned / row.billed) * 100 : 0,
      mainReason: [...row.reasons.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'Não informado',
    }))
    .sort((left, right) => right.returned - left.returned || right.returnPercentage - left.returnPercentage)
}

function buildReasons(notes: DashboardNote[], index: ReturnType<typeof createDataIndex>) {
  const totals = new Map<string, number>()
  notes.forEach((note) => {
    if (note.status !== 'Finalizada') return
    const legacy = index.legacyByNote.get(noteKey(note))
    if (legacy) {
      const reason = legacy.motivo?.trim() || 'Motivo não informado'
      totals.set(reason, (totals.get(reason) ?? 0) + numberValue(legacy.qtd_retorno_galinha) + numberValue(legacy.qtd_retorno_codorna))
      return
    }
    if (!note.chave_acesso) return
    const process = index.processByAccessKey.get(note.chave_acesso)
    if (!process) return
    ;(index.productsByProcess.get(process.id) ?? []).forEach((product) => {
      const divisions = index.reasonsByProduct.get(product.id) ?? []
      if (divisions.length > 0) {
        divisions.forEach((division) => {
          const reason = index.reasonNameById.get(division.motivo_id) ?? 'Motivo não informado'
          totals.set(reason, (totals.get(reason) ?? 0) + numberValue(division.quantidade))
        })
      } else if (product.motivo_id) {
        const reason = index.reasonNameById.get(product.motivo_id) ?? 'Motivo não informado'
        totals.set(reason, (totals.get(reason) ?? 0) + numberValue(product.quantidade_retorno))
      }
    })
  })
  return totals
}

function buildStores(notes: DashboardNote[], index: ReturnType<typeof createDataIndex>): DashboardStore[] {
  const stores = new Map<string, Omit<DashboardStore, 'returnPercentage'>>()
  notes.forEach((note) => {
    const key = String(note.codigo_cliente ?? note.nome_abreviado ?? note.estabelecimento ?? 'sem-loja')
    const row = stores.get(key) ?? {
      name: note.nome_abreviado?.trim() || note.estabelecimento?.trim() || `Loja ${key}`,
      billed: 0,
      returned: 0,
      returns: 0,
    }
    row.billed += numberValue(note.quantidade_galinha) + numberValue(note.quantidade_codorna)
    const noteReturn = getNoteReturn(note, index)
    row.returned += noteReturn.total
    row.returns += noteReturn.count
    stores.set(key, row)
  })

  return [...stores.values()]
    .filter((store) => store.billed > 0)
    .map((store) => ({ ...store, returnPercentage: (store.returned / store.billed) * 100 }))
    .sort((left, right) => left.returnPercentage - right.returnPercentage || right.billed - left.billed)
}

function buildFinancialSeries(notes: DashboardNote[]) {
  const values = new Map<string, number>()
  notes.forEach((note) => {
    const date = effectiveDate(note)
    if (!date) return
    values.set(date, (values.get(date) ?? 0) + numberValue(note.valor_total))
  })
  return [...values.entries()].map(([date, value]) => ({ date, value })).sort((left, right) => left.date.localeCompare(right.date))
}

export function calculateManagementDashboard(source: ManagementDashboardSource) {
  const index = createDataIndex(source)
  const current = buildPeriodSummary(source.current.notes, index)
  const previous = buildPeriodSummary(source.previous.notes, index)
  const currentReasons = buildReasons(source.current.notes, index)
  const previousReasons = buildReasons(source.previous.notes, index)
  const returnsAvailable = !source.sourceErrors.some(({ source: name }) => name === 'retornos modernos' || name === 'retornos legados')
  const productsAvailable = returnsAvailable && !source.sourceErrors.some(({ source: name }) => name === 'catálogo de produtos')
  const reasonsAvailable = returnsAvailable && !source.sourceErrors.some(({ source: name }) => name === 'motivos de devolução')

  const allProducts = buildProducts(source.current.notes, index)
  const allStores = buildStores(source.current.notes, index)
  const allReasons = [...currentReasons.entries()]
    .map(([name, quantity]) => ({
      name,
      quantity,
      percentage: current.returns.total > 0 ? (quantity / current.returns.total) * 100 : 0,
      evolution: percentageChange(quantity, previousReasons.get(name) ?? 0),
      evolutionAvailable: (previousReasons.get(name) ?? 0) > 0,
    }))
    .filter((reason) => reason.quantity > 0)
    .sort((left, right) => right.quantity - left.quantity)
    .map((reason, index) => ({ ...reason, rank: index + 1 }))

  return {
    current,
    previous,
    products: allProducts.slice(0, 6),
    allProducts,
    reasons: allReasons.slice(0, 7),
    allReasons,
    stores: allStores.slice(0, 6),
    allStores,
    financialSeries: buildFinancialSeries(source.current.notes),
    evolutions: {
      galinhaBilled: percentageChange(current.galinhaBilled, previous.galinhaBilled),
      codornaBilled: percentageChange(current.codornaBilled, previous.codornaBilled),
      galinhaReturn: percentageChange(current.returns.galinha, previous.returns.galinha),
      codornaReturn: percentageChange(current.returns.codorna, previous.returns.codorna),
    },
    returnsAvailable,
    productsAvailable,
    reasonsAvailable,
    sourceErrors: source.sourceErrors,
  }
}
