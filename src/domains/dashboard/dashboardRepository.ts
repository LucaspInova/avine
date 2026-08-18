import { fetchAllNfdNotas } from '../invoices'
import { toAppError } from '../../shared/errors'
import { supabase } from '../../shared/lib/supabaseClient'
import type {
  DashboardCatalogProduct,
  DashboardFstdProcess,
  DashboardInvoiceItem,
  DashboardFstdProduct,
  DashboardFstdReport,
  DashboardLegacyFstd,
  DashboardNote,
  DashboardNoteCollection,
  DashboardProductReason,
  DashboardReason,
  DashboardSourceError,
  DashboardStatus,
  DashboardUnknownNfd,
  ManagementDashboardFilters,
  ManagementDashboardSource,
} from './types'

const LEGACY_QUERY_CHUNK_SIZE = 45
const DASHBOARD_NFD_SELECT = 'chave_acesso, estabelecimento, nota_fiscal, data_emissao, data_referencia, codigo_cliente, nome_abreviado, uf, cidade, quantidade_galinha, quantidade_codorna, valor_total'

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`)
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function getPreviousPeriod(filters: ManagementDashboardFilters): ManagementDashboardFilters {
  const start = parseDate(filters.startDate)
  const end = parseDate(filters.endDate)
  const durationInDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  const previousEnd = new Date(start)
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setUTCDate(previousStart.getUTCDate() - durationInDays + 1)

  return {
    ...filters,
    startDate: formatDate(previousStart),
    endDate: formatDate(previousEnd),
  }
}

async function listAccessibleNfdNotes(filters: Pick<ManagementDashboardFilters, 'startDate' | 'endDate' | 'uf' | 'city'>) {
  return fetchAllNfdNotas(DASHBOARD_NFD_SELECT, (query) => {
    if (filters.startDate && filters.endDate) {
      query = query.or(`and(data_emissao.gte.${filters.startDate},data_emissao.lte.${filters.endDate}),and(data_emissao.is.null,data_referencia.gte.${filters.startDate},data_referencia.lte.${filters.endDate})`)
    } else if (filters.startDate) {
      query = query.or(`data_emissao.gte.${filters.startDate},and(data_emissao.is.null,data_referencia.gte.${filters.startDate})`)
    } else if (filters.endDate) {
      query = query.or(`data_emissao.lte.${filters.endDate},and(data_emissao.is.null,data_referencia.lte.${filters.endDate})`)
    }
    if (filters.uf) query = query.ilike('uf', filters.uf)
    if (filters.city) query = query.ilike('cidade', filters.city)
    return query.order('data_referencia', { ascending: false }).order('chave_acesso', { ascending: true })
  })
}

function noteDate(note: Pick<DashboardNote, 'data_emissao' | 'data_referencia'>) {
  return String(note.data_emissao ?? note.data_referencia ?? '').slice(0, 10)
}

function filterNfdNotes(notes: DashboardNote[], filters: ManagementDashboardFilters) {
  return notes.filter((note) => {
    const date = noteDate(note)
    return (!filters.startDate || date >= filters.startDate)
      && (!filters.endDate || date <= filters.endDate)
      && (!filters.uf || String(note.uf ?? '').toUpperCase() === filters.uf.toUpperCase())
      && (!filters.city || String(note.cidade ?? '').toLocaleLowerCase() === filters.city.toLocaleLowerCase())
  })
}

function latestProcessByAccessKey(processes: DashboardFstdProcess[]) {
  const latest = new Map<string, DashboardFstdProcess>()
  processes.forEach((process) => {
    const current = latest.get(process.nfd_chave_acesso)
    if (!current || process.created_at > current.created_at || (process.created_at === current.created_at && process.id > current.id)) {
      latest.set(process.nfd_chave_acesso, process)
    }
  })
  return latest
}

export function applyNfdStatuses(
  notes: DashboardNote[],
  filters: ManagementDashboardFilters,
  processes: DashboardFstdProcess[],
  legacy: DashboardLegacyFstd[],
  unknown: DashboardUnknownNfd[],
): DashboardNote[] {
  const latestProcess = latestProcessByAccessKey(processes)
  const legacyNoteKeys = new Set(legacy.map((item) => `${item.codigo_loja}:${item.numero_nfd}`))
  const unknownAccessKeys = new Set(unknown.map((item) => item.nfd_chave_acesso).filter(Boolean))
  const unknownReferences = new Set(unknown.map((item) => item.nfd_referencia))

  return notes.map((note) => {
    const reference = `${note.codigo_cliente ?? ''}:${note.nota_fiscal ?? ''}`
    const process = note.chave_acesso ? latestProcess.get(note.chave_acesso) : undefined
    const status: DashboardStatus = (note.chave_acesso && unknownAccessKeys.has(note.chave_acesso)) || unknownReferences.has(reference)
      ? 'Desconhecida'
      : legacyNoteKeys.has(reference) || process?.status === 'concluida'
        ? 'Finalizada'
        : 'Pendente'
    return { ...note, status }
  }).filter((note) => !filters.status || note.status === filters.status)
}

function createNoteCollection(notes: DashboardNote[], filterOptions: Pick<DashboardNote, 'uf' | 'cidade'>[] = notes): DashboardNoteCollection {
  return {
    notes,
    ufs: [...new Set(filterOptions.map((note) => note.uf).filter(Boolean))].sort(),
    cities: [...new Set(filterOptions.map((note) => note.cidade).filter(Boolean))].sort(),
  }
}

function escapePostgrestValue(value: string) {
  return `\"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}\"`
}

async function listLegacyFstd(notes: DashboardNote[]): Promise<DashboardLegacyFstd[]> {
  const uniquePairs = new Map<string, { storeCode: string; noteNumber: string }>()
  notes.forEach((note) => {
    if (note.codigo_cliente === null || note.nota_fiscal === null) return
    const storeCode = String(note.codigo_cliente)
    const noteNumber = String(note.nota_fiscal)
    uniquePairs.set(`${storeCode}:${noteNumber}`, { storeCode, noteNumber })
  })

  const pairs = [...uniquePairs.values()]
  const rows: DashboardLegacyFstd[] = []
  for (let index = 0; index < pairs.length; index += LEGACY_QUERY_CHUNK_SIZE) {
    const chunk = pairs.slice(index, index + LEGACY_QUERY_CHUNK_SIZE)
    const expression = chunk.map(({ storeCode, noteNumber }) => (
      `and(codigo_loja.eq.${escapePostgrestValue(storeCode)},numero_nfd.eq.${escapePostgrestValue(noteNumber)})`
    )).join(',')
    const { data, error } = await supabase
      .from('fstd_legado')
      .select('legado_id, codigo_loja, numero_nfd, data_preenchimento, motivo, qtd_total_galinha, qtd_retorno_galinha, qtd_total_codorna, qtd_retorno_codorna')
      .or(expression)
      .order('legado_id', { ascending: true })
    if (error) throw error
    rows.push(...(data ?? []) as DashboardLegacyFstd[])
  }

  return rows
}

async function listFstdProcessesByAccessKeys(accessKeys: string[]) {
  const rows: DashboardFstdProcess[] = []

  for (let index = 0; index < accessKeys.length; index += LEGACY_QUERY_CHUNK_SIZE) {
    const chunk = accessKeys.slice(index, index + LEGACY_QUERY_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('fstd_processos')
      .select('id, nfd_chave_acesso, status, finalizada_em, created_at, is_avulsa')
      .in('nfd_chave_acesso', chunk)

    if (error) return { data: null, error }
    rows.push(...(data ?? []) as DashboardFstdProcess[])
  }

  return { data: rows, error: null }
}

async function listInvoiceItemsByAccessKeys(accessKeys: string[]) {
  const rows: DashboardInvoiceItem[] = []
  for (let index = 0; index < accessKeys.length; index += LEGACY_QUERY_CHUNK_SIZE) {
    const { data, error } = await supabase
      .from('nfd_itens')
      .select('chave_acesso, codigo_produto, quantidade_galinha, valor_galinha, quantidade_codorna, valor_codorna')
      .in('chave_acesso', accessKeys.slice(index, index + LEGACY_QUERY_CHUNK_SIZE))
    if (error) return { data: null, error }
    rows.push(...(data ?? []) as DashboardInvoiceItem[])
  }
  return { data: rows, error: null }
}

async function listFstdReports(filters: Pick<ManagementDashboardFilters, 'startDate' | 'endDate'>) {
  let query = supabase
    .from('fstd_relatorio')
    .select('nome_abreviado, galinha_nfd, codorna_nfd, galinha_retorno, codorna_retorno')
  if (filters.startDate) query = query.gte('data_emissao', filters.startDate)
  if (filters.endDate) query = query.lte('data_emissao', filters.endDate)
  return query
}

function emptySource() {
  return { data: [], error: null }
}

async function readOperationalSources(notes: DashboardNote[], reportFilters: Pick<ManagementDashboardFilters, 'startDate' | 'endDate'>) {
  const accessKeys = [...new Set(notes.map((note) => note.chave_acesso).filter((value): value is string => Boolean(value)))]
  const invoiceItems = accessKeys.length
    ? await listInvoiceItemsByAccessKeys(accessKeys)
    : emptySource()
  const processes = accessKeys.length
    ? await listFstdProcessesByAccessKeys(accessKeys)
    : emptySource()
  const unknown = await supabase.from('nfd_desconhecimentos').select('nfd_chave_acesso, nfd_referencia, loja_codigo, nfd_numero').is('reconhecida_em', null)
  const reports = await listFstdReports(reportFilters)
  if (processes.error || unknown.error) return { processes, unknown, invoiceItems, reports, products: emptySource(), productReasons: emptySource(), reasons: emptySource(), catalogProducts: emptySource() }

  const processIds = [...new Set((processes.data ?? []).map((process) => process.id))]
  const products = processIds.length
    ? await supabase.from('fstd_produtos').select('id, processo_id, produto_id, codigo_produto, nome, quantidade_faturada_galinha, quantidade_faturada_codorna, quantidade_retorno, motivo_id, status').in('processo_id', processIds)
    : emptySource()
  if (products.error) return { processes, unknown, invoiceItems, reports, products, productReasons: emptySource(), reasons: emptySource(), catalogProducts: emptySource() }

  const productIds = [...new Set((products.data ?? []).map((product) => product.id))]
  const catalogIds = [...new Set((products.data ?? []).map((product) => product.produto_id).filter((value): value is string => Boolean(value)))]
  const reasonIds = [...new Set((products.data ?? []).map((product) => product.motivo_id).filter((value): value is string => Boolean(value)))]
  const [productReasons, reasons, catalogProducts] = await Promise.all([
    productIds.length ? supabase.from('fstd_produto_motivos').select('produto_id, motivo_id, quantidade').in('produto_id', productIds) : emptySource(),
    reasonIds.length ? supabase.from('motivos_devolucao').select('id, nome').in('id', reasonIds) : emptySource(),
    catalogIds.length ? supabase.from('produtos').select('id, nome, categoria').in('id', catalogIds) : emptySource(),
  ])

  return { processes, invoiceItems, products, productReasons, reasons, catalogProducts, unknown, reports }
}

function sourceFailure(source: string, error: unknown): DashboardSourceError {
  return { source, message: toAppError(error).message }
}

export async function loadManagementDashboard(filters: ManagementDashboardFilters, _signal?: AbortSignal): Promise<ManagementDashboardSource> {
  const sourceErrors: DashboardSourceError[] = []
  const previousFilters = getPreviousPeriod(filters)
  const notesQueryFilters = { ...filters, startDate: previousFilters.startDate, endDate: filters.endDate }
  const allNotes = await listAccessibleNfdNotes(notesQueryFilters)
  const allNotesRows = allNotes as DashboardNote[]
  const currentBaseNotes = filterNfdNotes(allNotesRows, filters)
  const previousBaseNotes = filterNfdNotes(allNotesRows, previousFilters)
  const [loadedLegacy, operational] = await Promise.all([
    listLegacyFstd([...currentBaseNotes, ...previousBaseNotes]).catch((error) => {
      throw toAppError(error, 'Não foi possível carregar os status legados das NFDs da dashboard.')
    }),
    readOperationalSources([...currentBaseNotes, ...previousBaseNotes], filters),
  ])
  const processesError = operational.processes.error
  const unknownError = operational.unknown.error
  if (processesError || unknownError) {
    throw toAppError(processesError ?? unknownError, 'Não foi possível carregar os status das NFDs da dashboard.')
  }

  const legacy = loadedLegacy
  const processes = (operational.processes.data ?? []) as DashboardFstdProcess[]
  const unknown = (operational.unknown.data ?? []) as DashboardUnknownNfd[]
  const current = createNoteCollection(
    applyNfdStatuses(currentBaseNotes, filters, processes, legacy, unknown),
    currentBaseNotes,
  )
  const previous = createNoteCollection(
    applyNfdStatuses(previousBaseNotes, previousFilters, processes, legacy, unknown),
    previousBaseNotes,
  )

  const entries = Object.entries(operational) as Array<[string, { error: unknown; data: unknown }]>
  const failureBySource = new Map(entries.filter(([, result]) => result.error).map(([source, result]) => [source, result.error]))
  const modernReturnFailure = failureBySource.get('products')
  const reasonFailure = failureBySource.get('productReasons') ?? failureBySource.get('reasons')
  const catalogFailure = failureBySource.get('catalogProducts')
  if (modernReturnFailure) sourceErrors.push(sourceFailure('retornos modernos', modernReturnFailure))
  if (reasonFailure) sourceErrors.push(sourceFailure('motivos de devolução', reasonFailure))
  if (catalogFailure) sourceErrors.push(sourceFailure('catálogo de produtos', catalogFailure))

  return {
    current,
    previous,
    processes,
    invoiceItems: operational.invoiceItems.data && !operational.invoiceItems.error ? operational.invoiceItems.data as DashboardInvoiceItem[] : [],
    products: operational.products.data && !operational.products.error ? operational.products.data as DashboardFstdProduct[] : [],
    productReasons: operational.productReasons.data && !operational.productReasons.error ? operational.productReasons.data as DashboardProductReason[] : [],
    reasons: operational.reasons.data && !operational.reasons.error ? operational.reasons.data as DashboardReason[] : [],
    catalogProducts: operational.catalogProducts.data && !operational.catalogProducts.error ? operational.catalogProducts.data as DashboardCatalogProduct[] : [],
    reports: operational.reports.data && !operational.reports.error ? operational.reports.data as DashboardFstdReport[] : [],
    legacy,
    sourceErrors,
  }
}
