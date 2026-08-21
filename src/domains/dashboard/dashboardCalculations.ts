import type {
  DashboardCatalogProduct,
  DashboardFstdProcess,
  DashboardInvoiceItem,
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
type FinancialSpeciesTotals = { galinhaBilled: number; codornaBilled: number; galinhaReturn: number; codornaReturn: number }
type FinalizedDashboardMetrics = {
  financialTotal: number
  financial: FinancialSpeciesTotals
  galinhaBilled: number
  codornaBilled: number
  returns: ReturnTotals
}

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
  const latestProcessByAccessKey = new Map<string, DashboardFstdProcess>()
  source.processes.forEach((process) => {
    if (process.is_avulsa) return
    const current = latestProcessByAccessKey.get(process.nfd_chave_acesso)
    if (!current || process.created_at > current.created_at || (process.created_at === current.created_at && process.id > current.id)) {
      latestProcessByAccessKey.set(process.nfd_chave_acesso, process)
    }
  })
  const processByAccessKey = new Map(
    [...latestProcessByAccessKey.entries()].filter(([, process]) => process.status === 'concluida'),
  )

  const productsByProcess = new Map<string, DashboardFstdProduct[]>()
  source.products.forEach((product) => {
    const products = productsByProcess.get(product.processo_id) ?? []
    products.push(product)
    productsByProcess.set(product.processo_id, products)
  })

  const invoiceItemsByAccessKey = new Map<string, DashboardInvoiceItem[]>()
  source.invoiceItems.forEach((item) => {
    const items = invoiceItemsByAccessKey.get(item.chave_acesso) ?? []
    items.push(item)
    invoiceItemsByAccessKey.set(item.chave_acesso, items)
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
    invoiceItemsByAccessKey,
    reasonsByProduct,
    legacyByNote,
    reasonNameById: new Map(source.reasons.map((reason) => [reason.id, reason.nome])),
    catalogById: new Map(source.catalogProducts.map((product) => [product.id, product])),
  }
}

function getNoteFinancialValues(note: DashboardNote, index: ReturnType<typeof createDataIndex>) {
  const items = note.chave_acesso ? index.invoiceItemsByAccessKey.get(note.chave_acesso) ?? [] : []
  const billedFromItems = items.reduce((totals, item) => ({
    galinha: totals.galinha + numberValue(item.valor_galinha),
    codorna: totals.codorna + numberValue(item.valor_codorna),
  }), { galinha: 0, codorna: 0 })
  if (billedFromItems.galinha > 0 || billedFromItems.codorna > 0) return billedFromItems

  const galinhaQuantity = numberValue(note.quantidade_galinha)
  const codornaQuantity = numberValue(note.quantidade_codorna)
  const totalQuantity = galinhaQuantity + codornaQuantity
  const totalValue = numberValue(note.valor_total)
  return totalQuantity > 0
    ? { galinha: totalValue * (galinhaQuantity / totalQuantity), codorna: totalValue * (codornaQuantity / totalQuantity) }
    : { galinha: 0, codorna: 0 }
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

function getLegacyStoreValues(note: DashboardNote, index: ReturnType<typeof createDataIndex>) {
  const legacy = index.legacyByNote.get(noteKey(note))
  if (!legacy) return null

  const billed = numberValue(legacy.qtd_total_galinha) + numberValue(legacy.qtd_total_codorna)
  const rawReturned = numberValue(legacy.qtd_retorno_galinha) + numberValue(legacy.qtd_retorno_codorna)
  const returned = Math.min(Math.max(0, rawReturned), Math.max(0, billed))

  // O card usa faturado e retorno do mesmo FSTD legado e protege a regra retorno <= faturado.
  return { billed, returned, returns: returned > 0 ? 1 : 0 }
}

function finalizeStore(row: Omit<DashboardStore, 'returnPercentage'>): DashboardStore {
  const billed = Math.max(0, row.billed)
  const returned = Math.min(Math.max(0, row.returned), billed)
  return { ...row, billed, returned, returnPercentage: billed > 0 ? (returned / billed) * 100 : 0 }
}

function buildPeriodSummary(notes: DashboardNote[], index: ReturnType<typeof createDataIndex>) {
  const status = { Finalizada: 0, Pendente: 0, Desconhecida: 0 }
  const returns: ReturnTotals = { galinha: 0, codorna: 0, total: 0, unresolved: 0, count: 0 }
  const modernReturns: ReturnTotals = { galinha: 0, codorna: 0, total: 0, unresolved: 0, count: 0 }
  const durations: number[] = []
  let financialTotal = 0
  const financial: FinancialSpeciesTotals = { galinhaBilled: 0, codornaBilled: 0, galinhaReturn: 0, codornaReturn: 0 }
  let galinhaBilled = 0
  let codornaBilled = 0
  let modernGalinhaBilled = 0
  let modernCodornaBilled = 0
  const finalized: FinalizedDashboardMetrics = {
    financialTotal: 0,
    financial: { galinhaBilled: 0, codornaBilled: 0, galinhaReturn: 0, codornaReturn: 0 },
    galinhaBilled: 0,
    codornaBilled: 0,
    returns: { galinha: 0, codorna: 0, total: 0, unresolved: 0, count: 0 },
  }

  notes.forEach((note) => {
    status[note.status] += 1
    financialTotal += numberValue(note.valor_total)
    const noteFinancial = getNoteFinancialValues(note, index)
    financial.galinhaBilled += noteFinancial.galinha
    financial.codornaBilled += noteFinancial.codorna
    galinhaBilled += numberValue(note.quantidade_galinha)
    codornaBilled += numberValue(note.quantidade_codorna)
    const noteReturn = getNoteReturn(note, index)
    returns.galinha += noteReturn.galinha
    returns.codorna += noteReturn.codorna
    returns.total += noteReturn.total
    returns.unresolved += noteReturn.unresolved
    returns.count += noteReturn.count
    if (noteReturn.source === 'modern') {
      const process = note.chave_acesso ? index.processByAccessKey.get(note.chave_acesso) : undefined
      ;(process ? index.productsByProcess.get(process.id) ?? [] : []).forEach((product) => {
        modernGalinhaBilled += numberValue(product.quantidade_faturada_galinha)
        modernCodornaBilled += numberValue(product.quantidade_faturada_codorna)
      })
      modernReturns.galinha += noteReturn.galinha
      modernReturns.codorna += noteReturn.codorna
      modernReturns.total += noteReturn.total
      modernReturns.unresolved += noteReturn.unresolved
      modernReturns.count += noteReturn.count
    }
    const galinhaQuantity = numberValue(note.quantidade_galinha)
    const codornaQuantity = numberValue(note.quantidade_codorna)
    if (galinhaQuantity > 0) financial.galinhaReturn += noteFinancial.galinha * (noteReturn.galinha / galinhaQuantity)
    if (codornaQuantity > 0) financial.codornaReturn += noteFinancial.codorna * (noteReturn.codorna / codornaQuantity)
    if (noteReturn.duration !== null) durations.push(noteReturn.duration)
    if (note.status === 'Finalizada') {
      finalized.financialTotal += numberValue(note.valor_total)
      finalized.financial.galinhaBilled += noteFinancial.galinha
      finalized.financial.codornaBilled += noteFinancial.codorna
      finalized.galinhaBilled += galinhaQuantity
      finalized.codornaBilled += codornaQuantity
      finalized.returns.galinha += noteReturn.galinha
      finalized.returns.codorna += noteReturn.codorna
      finalized.returns.total += noteReturn.total
      finalized.returns.unresolved += noteReturn.unresolved
      finalized.returns.count += noteReturn.count
      if (galinhaQuantity > 0) finalized.financial.galinhaReturn += noteFinancial.galinha * (noteReturn.galinha / galinhaQuantity)
      if (codornaQuantity > 0) finalized.financial.codornaReturn += noteFinancial.codorna * (noteReturn.codorna / codornaQuantity)
    }
  })

  return {
    totalNfds: notes.length,
    status,
    financialTotal,
    financial,
    ticketAverage: notes.length > 0 ? financialTotal / notes.length : null,
    galinhaBilled,
    codornaBilled,
    modernGalinhaBilled,
    modernCodornaBilled,
    returns,
    modernReturns,
    finalized,
    averageDays: safeAverage(durations),
  }
}

function buildProducts(notes: DashboardNote[], index: ReturnType<typeof createDataIndex>) {
  const rows = new Map<string, {
    name: string
    category: string
    returned: number
    billed: number
    reasons: Map<string, { returned: number; billed: number }>
  }>()
  const invoiceTotalsByCode = new Map<string, { galinha: number; codorna: number }>()
  notes.forEach((note) => {
    if (index.legacyByNote.has(noteKey(note)) || !note.chave_acesso || !index.processByAccessKey.has(note.chave_acesso)) return
    ;(index.invoiceItemsByAccessKey.get(note.chave_acesso) ?? []).forEach((item) => {
      const current = invoiceTotalsByCode.get(item.codigo_produto) ?? { galinha: 0, codorna: 0 }
      current.galinha += numberValue(item.quantidade_galinha)
      current.codorna += numberValue(item.quantidade_codorna)
      invoiceTotalsByCode.set(item.codigo_produto, current)
    })
  })
  notes.forEach((note) => {
    if (!note.chave_acesso || index.legacyByNote.has(noteKey(note))) return
    const process = index.processByAccessKey.get(note.chave_acesso)
    if (!process) return
    ;(index.productsByProcess.get(process.id) ?? []).forEach((product) => {
      const catalog = product.produto_id ? index.catalogById.get(product.produto_id) : undefined
      const key = product.codigo_produto
      const row = rows.get(key) ?? {
        name: catalog?.nome?.trim() || product.nome || product.codigo_produto,
        category: catalog?.categoria?.trim() || 'Não categorizado',
        returned: 0,
        billed: (() => {
          const invoiceTotals = invoiceTotalsByCode.get(product.codigo_produto)
          if (!invoiceTotals) return 0
          return catalog?.categoria?.toLowerCase().includes('codorna') ? invoiceTotals.codorna : invoiceTotals.galinha
        })(),
        reasons: new Map<string, { returned: number; billed: number }>(),
      }
      row.returned += numberValue(product.quantidade_retorno)
      if (!invoiceTotalsByCode.has(product.codigo_produto)) row.billed += numberValue(product.quantidade_faturada_galinha) + numberValue(product.quantidade_faturada_codorna)
      const divisions = index.reasonsByProduct.get(product.id) ?? []
      if (divisions.length > 0) {
        divisions.forEach((division) => {
          const reason = index.reasonNameById.get(division.motivo_id) ?? 'Motivo não informado'
          const totals = row.reasons.get(reason) ?? { returned: 0, billed: 0 }
          totals.returned += numberValue(division.quantidade)
          totals.billed += numberValue(division.quantidade_faturada)
          row.reasons.set(reason, totals)
        })
      } else if (product.motivo_id) {
        const reason = index.reasonNameById.get(product.motivo_id) ?? 'Motivo não informado'
        const totals = row.reasons.get(reason) ?? { returned: 0, billed: 0 }
        totals.returned += numberValue(product.quantidade_retorno)
        totals.billed += numberValue(product.quantidade_faturada_galinha) + numberValue(product.quantidade_faturada_codorna)
        row.reasons.set(reason, totals)
      }
      rows.set(key, row)
    })
  })

  invoiceTotalsByCode.forEach((totals, code) => {
    if (rows.has(code)) return
    const billed = totals.galinha + totals.codorna
    rows.set(code, { name: code, category: 'Não categorizado', returned: 0, billed, reasons: new Map() })
  })

  return [...rows.values()]
    .filter((row) => row.billed > 0 || row.returned > 0)
    .map((row) => {
      const mainReturnReason = [...row.reasons.entries()]
        .sort((left, right) => (
          right[1].returned - left[1].returned || right[1].billed - left[1].billed
        ))[0]?.[0]

      return {
        ...row,
        returnPercentage: row.billed > 0 ? (row.returned / row.billed) * 100 : 0,
        mainReason: mainReturnReason ?? 'Motivo não informado',
      }
    })
    .sort((left, right) => right.returned - left.returned || right.returnPercentage - left.returnPercentage)
}

function buildReasons(notes: DashboardNote[], index: ReturnType<typeof createDataIndex>) {
  const totals = new Map<string, { billed: number; returned: number }>()
  const addTotal = (reason: string, billed: number, returned: number) => {
    const total = totals.get(reason) ?? { billed: 0, returned: 0 }
    total.billed += billed
    total.returned += returned
    totals.set(reason, total)
  }
  notes.forEach((note) => {
    if (note.status !== 'Finalizada') return
    const legacy = index.legacyByNote.get(noteKey(note))
    if (legacy) {
      const reason = legacy.motivo?.trim() || 'Motivo não informado'
      addTotal(
        reason,
        numberValue(legacy.qtd_total_galinha) + numberValue(legacy.qtd_total_codorna),
        numberValue(legacy.qtd_retorno_galinha) + numberValue(legacy.qtd_retorno_codorna),
      )
      return
    }
    if (!note.chave_acesso) return
    const process = index.processByAccessKey.get(note.chave_acesso)
    if (!process) return
    ;(index.productsByProcess.get(process.id) ?? []).forEach((product) => {
      const divisions = index.reasonsByProduct.get(product.id) ?? []
      const billed = numberValue(product.quantidade_faturada_galinha) + numberValue(product.quantidade_faturada_codorna)
      const returned = numberValue(product.quantidade_retorno)
      if (divisions.length > 0) {
        const distributedReturn = divisions.reduce((total, division) => total + numberValue(division.quantidade), 0)
        const allocationBase = returned || distributedReturn
        divisions.forEach((division) => {
          const reason = index.reasonNameById.get(division.motivo_id) ?? 'Motivo não informado'
          const divisionReturn = numberValue(division.quantidade)
          addTotal(reason, allocationBase > 0 ? billed * (divisionReturn / allocationBase) : 0, divisionReturn)
        })
      } else if (product.motivo_id) {
        const reason = index.reasonNameById.get(product.motivo_id) ?? 'Motivo não informado'
        addTotal(reason, billed, returned)
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
    const legacyValues = getLegacyStoreValues(note, index)
    if (legacyValues) {
      row.billed += legacyValues.billed
      row.returned += legacyValues.returned
      row.returns += legacyValues.returns
    } else {
      row.billed += numberValue(note.quantidade_galinha) + numberValue(note.quantidade_codorna)
      const noteReturn = getNoteReturn(note, index)
      row.returned += noteReturn.total
      row.returns += noteReturn.count
    }
    stores.set(key, row)
  })

  return [...stores.values()]
    .filter((store) => store.billed > 0)
    .map(finalizeStore)
    .sort((left, right) => right.returnPercentage - left.returnPercentage || right.billed - left.billed)
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
    .map(([name, totals]) => ({
      name,
      billed: totals.billed,
      returned: totals.returned,
      percentage: current.returns.total > 0 ? (totals.returned / current.returns.total) * 100 : 0,
      evolution: percentageChange(totals.returned, previousReasons.get(name)?.returned ?? 0),
      evolutionAvailable: (previousReasons.get(name)?.returned ?? 0) > 0,
    }))
    .filter((reason) => reason.returned > 0)
    .sort((left, right) => right.returned - left.returned)
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
      galinhaReturn: percentageChange(current.finalized.returns.galinha, previous.finalized.returns.galinha),
      codornaReturn: percentageChange(current.finalized.returns.codorna, previous.finalized.returns.codorna),
    },
    returnsAvailable,
    productsAvailable,
    reasonsAvailable,
    sourceErrors: source.sourceErrors,
  }
}
