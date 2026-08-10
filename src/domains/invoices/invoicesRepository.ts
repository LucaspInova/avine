import { supabase } from '../../shared/lib/supabaseClient'
import { paginateSupabase } from '../../shared/api/pagination'
import { toAppError } from '../../shared/errors'
import type { InvoiceListFilters, InvoiceOverviewPage, MarkInvoiceUnknownCommand, RecognizeInvoiceCommand } from './types'

export async function fetchAllNfdNotas(select: string, configureQuery?: (query: any) => any) {
  return paginateSupabase<any>((from, to) => {
    let query: any = supabase!.from('nfd_notas').select(select)
    if (configureQuery) query = configureQuery(query)
    return query.range(from, to)
  })
}

export async function listInvoicesOverview(filters: InvoiceListFilters, signal?: AbortSignal): Promise<InvoiceOverviewPage> {
  try {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 10))
    const request = (supabase as any).rpc('listar_nfd_notas_gerencial', {
      p_data_inicial: filters.startDate || null, p_data_final: filters.endDate || null,
      p_status: filters.status || null, p_uf: filters.uf || null, p_cidade: filters.city || null,
      p_pesquisa: filters.search?.trim() || null, p_ordenar_por: filters.sortBy ?? 'data_emissao',
      p_direcao: filters.direction ?? 'desc', p_limite: pageSize, p_deslocamento: (page - 1) * pageSize,
    })
    const { data, error } = await (signal ? request.abortSignal(signal) : request)
    if (error) throw error
    return data as InvoiceOverviewPage
  } catch (error) { throw toAppError(error, 'Não foi possível carregar as notas fiscais.') }
}

export async function startInvoiceProcess(storeId: string, accessKey: string) {
  const { error } = await supabase!.rpc('iniciar_fstd_produtos_v2', { p_loja_id: storeId, p_nfd_chave_acesso: accessKey })
  if (error) throw toAppError(error)
}

export async function findInvoiceStore(code: string | number, restrictedUfs: string[] = []) {
  let query = supabase!.from('lojas').select('id, codigo, nome, uf, cidade').eq('codigo', String(code))
  if (restrictedUfs.length) query = query.in('uf', restrictedUfs as any)
  const { data, error } = await query.maybeSingle()
  if (error) throw toAppError(error)
  return data
}

export async function markInvoiceUnknown(store: MarkInvoiceUnknownCommand['store'], note: MarkInvoiceUnknownCommand['note'], comment: string) {
  const { error } = await (supabase as any).rpc('desconhecer_nfd_gerencial', { p_loja_id: store.id, p_nfd_referencia: `${note.codigo_cliente ?? ''}:${note.nota_fiscal ?? ''}`, p_nfd_chave_acesso: note.chave_acesso ? String(note.chave_acesso) : null, p_nfd_numero: String(note.nota_fiscal ?? ''), p_loja_codigo: store.codigo ? String(store.codigo) : null, p_comentario: comment })
  if (error) throw toAppError(error)
}

export async function recognizeInvoice(note: RecognizeInvoiceCommand) {
  const { error } = await (supabase as any).rpc('reconhecer_nfd_gerencial', { p_nfd_referencia: `${note.codigo_cliente ?? ''}:${note.nota_fiscal ?? ''}`, p_nfd_chave_acesso: note.chave_acesso ? String(note.chave_acesso) : null, p_nfd_numero: String(note.nota_fiscal ?? '') })
  if (error) throw toAppError(error)
}
