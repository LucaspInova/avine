import { supabase } from '../../shared/lib/supabaseClient'
import { sortStoresByCode } from './storeRules'
import { paginateSupabase } from '../../shared/api/pagination'
import { toAppError } from '../../shared/errors'
import type { CreateStoreCommand, StoreFilters, StoreListItemViewModel, StorePromoterAssignmentViewModel } from './types'

export function createStoresRepository(client: any) {
async function listStores(filters: StoreFilters = {}) {
  const rows = await paginateSupabase<StoreListItemViewModel>((from, to) => {
    let query = client.from('lojas').select('id, codigo, nome, uf, cidade, created_at')
    if (filters.ufs?.length) query = query.in('uf', filters.ufs)
    if (filters.codigo) query = query.eq('codigo', filters.codigo)
    if (filters.search) query = query.or(`codigo.ilike.%${filters.search}%,nome.ilike.%${filters.search}%`)
    return query.order('codigo', { ascending: true }).range(from, to)
  })
  return sortStoresByCode(rows)
}

async function createStore(payload: CreateStoreCommand) {
  const { data, error } = await client.from('lojas').insert(payload).select().single()
  if (error) throw toAppError(error)
  return data
}

async function listStorePromoters(storeIds?: string[]): Promise<StorePromoterAssignmentViewModel[]> {
  let query = client.from('loja_promotores').select('id, loja_id, promotor_id, posicao')
  if (storeIds?.length) query = query.in('loja_id', storeIds)
  const { data, error } = await query.order('posicao', { ascending: true })
  if (error) throw toAppError(error)
  return data ?? []
}

async function assignStorePromoter(lojaId: string, posicao: number, promotorId: string) {
  const { data, error } = await client.from('loja_promotores').upsert({ loja_id: lojaId, posicao, promotor_id: promotorId }, { onConflict: 'loja_id,posicao' }).select('id, loja_id, promotor_id, posicao').single()
  if (error) throw toAppError(error)
  return data
}

async function removeStorePromoter(lojaId: string, posicao: number) {
  const { error } = await client.from('loja_promotores').delete().eq('loja_id', lojaId).eq('posicao', posicao)
  if (error) throw toAppError(error)
}

async function saveStoreRoute(lojaId: string, promoterIds: string[]): Promise<StorePromoterAssignmentViewModel[]> {
  const { data, error } = await client.rpc('salvar_rota_loja', {
    p_loja_id: lojaId,
    p_promotor_ids: promoterIds,
  })
  if (error) throw toAppError(error)
  return (data ?? []) as StorePromoterAssignmentViewModel[]
}

return { listStores, createStore, listStorePromoters, assignStorePromoter, removeStorePromoter, saveStoreRoute }
}

const repository = createStoresRepository(supabase)
export const { listStores, createStore, listStorePromoters, assignStorePromoter, removeStorePromoter, saveStoreRoute } = repository
