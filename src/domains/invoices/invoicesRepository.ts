import { supabase } from '../../shared/lib/supabaseClient'
import { paginateSupabase } from '../../shared/api/pagination'
import { toAppError } from '../../shared/errors'

export async function fetchAllNfdNotas(select: string, configureQuery?: (query: any) => any) {
  return paginateSupabase<any>((from, to) => {
    let query: any = supabase!.from('nfd_notas').select(select)
    if (configureQuery) query = configureQuery(query)
    return query.range(from, to)
  })
}

export async function listInvoicesOverview(restrictedUfs: string[] = []) {
  try {
    const scope = (query: any) => restrictedUfs.length ? query.in('uf', restrictedUfs) : query
    const [notes, processes, unknown, locations] = await Promise.all([
      paginateSupabase<any>((from, to) => scope(supabase!.from('nfd_notas').select('chave_acesso, estabelecimento, nota_fiscal, data_emissao, data_referencia, codigo_cliente, nome_abreviado, uf, cidade, quantidade_galinha, quantidade_codorna, valor_total')).order('data_referencia', { ascending: false }).order('nota_fiscal', { ascending: false }).range(from, to)),
      paginateSupabase<any>((from, to) => supabase!.from('fstd_processos').select('id, nfd_chave_acesso, status, created_at').order('created_at', { ascending: false }).range(from, to)),
      paginateSupabase<any>((from, to) => supabase!.from('nfd_desconhecimentos').select('id, nfd_referencia, nfd_chave_acesso, nfd_numero, loja_codigo, created_at, reconhecida_em').is('reconhecida_em', null).order('created_at', { ascending: false }).range(from, to)),
      paginateSupabase<any>((from, to) => scope(supabase!.from('nfd_itens').select('chave_acesso, uf, cidade')).order('chave_acesso', { ascending: true }).range(from, to)),
    ])
    const statusByKey = new Map(processes.map((item) => [String(item.nfd_chave_acesso), item.status]))
    const unknownKeys = new Set<string>()
    unknown.forEach((item) => {
      if (item.nfd_chave_acesso) unknownKeys.add(`key:${item.nfd_chave_acesso}`)
      if (item.nfd_referencia) unknownKeys.add(`ref:${item.nfd_referencia}`)
    })
    const locationByKey = new Map<string, any>()
    locations.forEach((item) => locationByKey.set(String(item.chave_acesso), { ...locationByKey.get(String(item.chave_acesso)), uf: locationByKey.get(String(item.chave_acesso))?.uf || item.uf, cidade: locationByKey.get(String(item.chave_acesso))?.cidade || item.cidade }))
    return notes.map((note) => ({ ...note, uf: note.uf || locationByKey.get(String(note.chave_acesso))?.uf || '', cidade: note.cidade || locationByKey.get(String(note.chave_acesso))?.cidade || '', status: unknownKeys.has(`key:${note.chave_acesso}`) || unknownKeys.has(`ref:${note.codigo_cliente}:${note.nota_fiscal}`) ? 'Desconhecida' : statusByKey.get(String(note.chave_acesso)) === 'concluida' ? 'Finalizada' : 'Pendente' }))
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

export async function markInvoiceUnknown(store: any, note: any, comment: string) {
  const { error } = await (supabase as any).rpc('desconhecer_nfd_gerencial', { p_loja_id: store.id, p_nfd_referencia: `${note.codigo_cliente ?? ''}:${note.nota_fiscal ?? ''}`, p_nfd_chave_acesso: note.chave_acesso ? String(note.chave_acesso) : null, p_nfd_numero: String(note.nota_fiscal ?? ''), p_loja_codigo: store.codigo ? String(store.codigo) : null, p_comentario: comment })
  if (error) throw toAppError(error)
}

export async function recognizeInvoice(note: any) {
  const { error } = await (supabase as any).rpc('reconhecer_nfd_gerencial', { p_nfd_referencia: `${note.codigo_cliente ?? ''}:${note.nota_fiscal ?? ''}`, p_nfd_chave_acesso: note.chave_acesso ? String(note.chave_acesso) : null, p_nfd_numero: String(note.nota_fiscal ?? '') })
  if (error) throw toAppError(error)
}
