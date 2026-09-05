import { toAppError } from '../../shared/errors'
import { supabase } from '../../shared/lib/supabaseClient'
import type {
  DashboardCatalogProduct,
  DashboardFstdProcess,
  DashboardInvoiceItem,
  DashboardFstdProduct,
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
    const status: DashboardStatus = legacyNoteKeys.has(reference) || process?.status === 'concluida'
      ? 'Finalizada'
      : (note.chave_acesso && unknownAccessKeys.has(note.chave_acesso)) || unknownReferences.has(reference)
        ? 'Desconhecida'
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

type DashboardOperationalSourcesPayload = {
  notes?: DashboardNote[]
  processes?: DashboardFstdProcess[]
  invoiceItems?: DashboardInvoiceItem[]
  products?: DashboardFstdProduct[]
  productReasons?: DashboardProductReason[]
  reasons?: DashboardReason[]
  catalogProducts?: DashboardCatalogProduct[]
  unknown?: DashboardUnknownNfd[]
  legacy?: DashboardLegacyFstd[]
}

function arrayFromPayload<T>(value: T[] | undefined) {
  return Array.isArray(value) ? value : []
}

export function collectDashboardReasonIds(
  products: Pick<DashboardFstdProduct, 'motivo_id'>[],
  productReasons: Pick<DashboardProductReason, 'motivo_id'>[],
) {
  return [...new Set([
    ...products.map((product) => product.motivo_id),
    ...productReasons.map((reason) => reason.motivo_id),
  ].filter((value): value is string => Boolean(value)))]
}

async function readManagementDashboard(filters: ManagementDashboardFilters, signal?: AbortSignal) {
  const request = supabase.rpc('carregar_dashboard_gerencial', {
    p_data_inicial: filters.startDate,
    p_data_final: filters.endDate,
    p_uf: filters.uf || undefined,
    p_cidade: filters.city || undefined,
  })
  const { data, error } = await (signal ? request.abortSignal(signal) : request)
  if (error) throw error

  const payload = (data ?? {}) as DashboardOperationalSourcesPayload
  return {
    notes: arrayFromPayload(payload.notes),
    processes: { data: arrayFromPayload(payload.processes), error: null },
    invoiceItems: { data: arrayFromPayload(payload.invoiceItems), error: null },
    products: { data: arrayFromPayload(payload.products), error: null },
    productReasons: { data: arrayFromPayload(payload.productReasons), error: null },
    reasons: { data: arrayFromPayload(payload.reasons), error: null },
    catalogProducts: { data: arrayFromPayload(payload.catalogProducts), error: null },
    unknown: { data: arrayFromPayload(payload.unknown), error: null },
    legacy: arrayFromPayload(payload.legacy),
  }
}

function sourceFailure(source: string, error: unknown): DashboardSourceError {
  return { source, message: toAppError(error).message }
}

export async function loadManagementDashboard(filters: ManagementDashboardFilters, signal?: AbortSignal): Promise<ManagementDashboardSource> {
  const sourceErrors: DashboardSourceError[] = []
  const previousFilters = getPreviousPeriod(filters)
  const operational = await readManagementDashboard(filters, signal)
  const allNotesRows = operational.notes
  const currentBaseNotes = filterNfdNotes(allNotesRows, filters)
  const previousBaseNotes = filterNfdNotes(allNotesRows, previousFilters)
  const processesError = operational.processes.error
  const unknownError = operational.unknown.error
  if (processesError || unknownError) {
    throw toAppError(processesError ?? unknownError, 'Não foi possível carregar os status das NFDs da dashboard.')
  }

  const legacy = operational.legacy
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

  const entries = Object.entries(operational).filter(([source]) => source !== 'legacy' && source !== 'notes') as Array<[string, { error: unknown; data: unknown }]>
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
    legacy,
    sourceErrors,
  }
}
