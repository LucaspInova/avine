import { supabase } from '../../shared/lib/supabaseClient'
import { paginateSupabase } from '../../shared/api/pagination'
import { toAppError } from '../../shared/errors'
import type { InvoiceOverviewViewModel, MarkInvoiceUnknownCommand, RecognizeInvoiceCommand } from './types'

export async function fetchAllNfdNotas(select: string, configureQuery?: (query: any) => any) {
  return paginateSupabase<any>((from, to) => {
    let query: any = supabase!.from('nfd_notas').select(select)
    if (configureQuery) query = configureQuery(query)
    return query.range(from, to)
  })
}

export async function listInvoicesOverview(restrictedUfs: string[] = [], startDate?: string, endDate?: string): Promise<InvoiceOverviewViewModel[]> {
  try {
    return await paginateSupabase<any>((from, to) => {
      let query: any = (supabase as any).rpc('listar_nfd_notas_gerencial', {
        p_data_inicial: startDate || null,
        p_data_final: endDate || null,
      })
      if (restrictedUfs.length) query = query.in('uf', restrictedUfs)
      return query.range(from, to)
    })
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
