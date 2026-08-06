import { supabase } from '../../shared/lib/supabaseClient'
import { sortStoresByCode } from './storeRules'
import { paginateSupabase } from '../../shared/api/pagination'
import { toAppError } from '../../shared/errors'

type StoreFilters = { ufs?: string[]; codigo?: string; search?: string }

export async function listStores(filters: StoreFilters = {}) {
  const rows = await paginateSupabase<any>((from, to) => {
    let query = supabase!.from('lojas').select('id, codigo, nome, uf, cidade, created_at')
    if (filters.ufs?.length) query = query.in('uf', filters.ufs as any)
    if (filters.codigo) query = query.eq('codigo', filters.codigo)
    if (filters.search) query = query.or(`codigo.ilike.%${filters.search}%,nome.ilike.%${filters.search}%`)
    return query.order('codigo', { ascending: true }).range(from, to)
  })
  return sortStoresByCode(rows)
}

export async function createStore(payload: Record<string, unknown>) {
  const { data, error } = await supabase!.from('lojas').insert(payload as any).select().single()
  if (error) throw toAppError(error)
  return data
}

export async function listStorePromoters(storeIds?: string[]) {
  let query = supabase!.from('loja_promotores').select('id, loja_id, promotor_id, posicao')
  if (storeIds?.length) query = query.in('loja_id', storeIds)
  const { data, error } = await query.order('posicao', { ascending: true })
  if (error) throw toAppError(error)
  return data ?? []
}

export async function assignStorePromoter(lojaId: string, posicao: 1 | 2 | 3, promotorId: string) {
  const { data, error } = await supabase!.from('loja_promotores').upsert({ loja_id: lojaId, posicao, promotor_id: promotorId }, { onConflict: 'loja_id,posicao' }).select('id, loja_id, promotor_id, posicao').single()
  if (error) throw toAppError(error)
  return data
}

export async function removeStorePromoter(lojaId: string, posicao: 1 | 2 | 3) {
  const { error } = await supabase!.from('loja_promotores').delete().eq('loja_id', lojaId).eq('posicao', posicao)
  if (error) throw toAppError(error)
}
