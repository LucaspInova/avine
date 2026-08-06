import type { Estado } from '../../types/database.types'
import type { TableInsert, TableRow } from '../../types/database.helpers'

export type StoreRecord = TableRow<'lojas'>
export type StoreListItemViewModel = Pick<StoreRecord, 'id' | 'codigo' | 'nome' | 'uf' | 'cidade' | 'created_at'>
export type StoreReferenceViewModel = Pick<StoreRecord, 'id' | 'codigo' | 'nome' | 'uf' | 'cidade'>
export type CreateStoreCommand = Omit<TableInsert<'lojas'>, 'id' | 'created_at'>

export type StoreFilters = { ufs?: Estado[]; codigo?: string; search?: string }

export type StorePromoterRecord = TableRow<'loja_promotores'>
export type StorePromoterAssignmentViewModel = Pick<StorePromoterRecord, 'id' | 'loja_id' | 'promotor_id' | 'posicao'>
export type AssignStorePromoterCommand = Pick<StorePromoterRecord, 'posicao'> & {
  storeId: string
  promoterId: string
}
