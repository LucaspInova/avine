import { supabase } from '../../shared/lib/supabaseClient'
import { paginateSupabase } from '../../shared/api/pagination'
import { toAppError } from '../../shared/errors'
import type { InvoiceListFilters, InvoiceOverviewPage, MarkInvoiceUnknownCommand, RecognizeInvoiceCommand, StartInvoiceProcessResult, UnknownInvoiceHistoryItem } from './types'

const hydratedInvoiceSelect = 'chave_acesso, estabelecimento, nota_fiscal, data_emissao, data_referencia, codigo_cliente, nome_abreviado, uf, cidade, quantidade_galinha, valor_galinha, quantidade_codorna, valor_codorna, valor_total, quantidade_itens, quantidade_produtos_distintos, detalhes'

function isAbortError(error: unknown, signal?: AbortSignal) {
  if (signal?.aborted) return true
  if (!error || typeof error !== 'object') return false
  return 'name' in error && String(error.name) === 'AbortError'
}

export async function fetchAllNfdNotas(select: string, configureQuery?: (query: any) => any, signal?: AbortSignal) {
  return paginateSupabase<any>((from, to) => {
    let query: any = supabase!.from('nfd_notas').select(select)
    if (configureQuery) query = configureQuery(query)
    query = query.range(from, to)
    return signal ? query.abortSignal(signal) : query
  })
}

export async function listInvoicesOverview(filters: InvoiceListFilters, signal?: AbortSignal): Promise<InvoiceOverviewPage> {
  try {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 10))
    const request = (supabase as any).rpc('listar_nfd_notas_gerencial', {
      p_data_inicial: filters.startDate || null, p_data_final: filters.endDate || null,
      p_status: filters.status || null, p_uf: filters.uf || null, p_cidade: filters.city || null,
      p_responsavel_id: filters.responsibleId || null, p_criado_por_id: filters.createdById || null,
      p_atualizado_por_id: filters.updatedById || null, p_promotor_rota_id: filters.routePromoterId || null,
      p_pesquisa: filters.search?.trim() || null, p_ordenar_por: filters.sortBy ?? 'data_emissao',
      p_direcao: filters.direction ?? 'desc', p_limite: pageSize, p_deslocamento: (page - 1) * pageSize,
    })
    const { data, error } = await (signal ? request.abortSignal(signal) : request)
    if (error) throw error
    return data as InvoiceOverviewPage
  } catch (error) {
    if (isAbortError(error, signal)) throw error

    console.error('[Notas] Falha ao carregar listagem gerencial:', error)
    const technicalMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
    throw toAppError(error, technicalMessage ? `Não foi possível carregar as notas fiscais: ${technicalMessage}` : 'Não foi possível carregar as notas fiscais.')
  }
}

export async function startInvoiceProcess(storeId: string, accessKey: string): Promise<StartInvoiceProcessResult> {
  const { data: processId, error: processError } = await supabase!.rpc('iniciar_fstd_produtos_v2', { p_loja_id: storeId, p_nfd_chave_acesso: accessKey })
  if (processError) throw toAppError(processError)

  const { data: note, error: noteError } = await supabase!
    .from('nfd_notas')
    .select(hydratedInvoiceSelect)
    .eq('chave_acesso', accessKey)
    .single()
  if (noteError) throw toAppError(noteError)

  return { processId: String(processId), note }
}

export async function findInvoiceStore(code: string | number, restrictedUfs: string[] = []) {
  let query = supabase!.from('lojas').select('id, codigo, nome, uf, cidade').eq('codigo', String(code))
  if (restrictedUfs.length) query = query.in('uf', restrictedUfs as any)
  const { data, error } = await query.maybeSingle()
  if (error) throw toAppError(error)
  return data
}

export async function markInvoiceUnknown(store: MarkInvoiceUnknownCommand['store'], note: MarkInvoiceUnknownCommand['note'], comment: string, commentType: MarkInvoiceUnknownCommand['commentType'] = 'comentario') {
  const { error } = await (supabase as any).rpc('registrar_desconhecimento_nfd', { p_loja_id: store.id, p_nfd_referencia: `${note.codigo_cliente ?? ''}:${note.nota_fiscal ?? ''}`, p_nfd_chave_acesso: note.chave_acesso ? String(note.chave_acesso) : null, p_nfd_numero: String(note.nota_fiscal ?? ''), p_loja_codigo: store.codigo ? String(store.codigo) : null, p_comentario: comment, p_tipo: commentType })
  if (error) throw toAppError(error)
}

export function normalizeUnknownInvoiceNumber(value: string | number | null | undefined) {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (/^\d+$/.test(normalized)) return normalized.replace(/^0+(?=\d)/, '')
  return normalized
}

export async function listInvoiceUnknownHistory(storeId: string, invoiceNumber: string | number): Promise<UnknownInvoiceHistoryItem[]> {
  const normalizedNumber = normalizeUnknownInvoiceNumber(invoiceNumber)
  if (!storeId || !normalizedNumber) return []

  const { data, error } = await (supabase as any)
    .from('nfd_desconhecimento_historico')
    .select('desconhecimento_id, loja_id, nfd_referencia, nfd_chave_acesso, nfd_numero, nfd_numero_normalizado, loja_codigo, ativo, encerramento_motivo, comentario_id, usuario_id, autor_nome, autor_perfil, tipo, comentario, created_at')
    .eq('loja_id', storeId)
    .eq('nfd_numero_normalizado', normalizedNumber)
    .order('created_at', { ascending: true })
    .order('comentario_id', { ascending: true })

  if (error) throw toAppError(error)
  return (data ?? []) as UnknownInvoiceHistoryItem[]
}

export async function recognizeInvoice(note: RecognizeInvoiceCommand) {
  const { error } = await (supabase as any).rpc('reconhecer_nfd_gerencial', { p_nfd_referencia: `${note.codigo_cliente ?? ''}:${note.nota_fiscal ?? ''}`, p_nfd_chave_acesso: note.chave_acesso ? String(note.chave_acesso) : null, p_nfd_numero: String(note.nota_fiscal ?? '') })
  if (error) throw toAppError(error)
}
