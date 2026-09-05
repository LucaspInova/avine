import type { TableRow, ViewRow } from '../../types/database.helpers'
import type { StoreReferenceViewModel } from '../stores/types'

export type InvoiceRecord = ViewRow<'nfd_notas'>
export type InvoiceItemRecord = TableRow<'nfd_itens'>
export type UnknownInvoiceRecord = TableRow<'nfd_desconhecimentos'>

export type InvoiceOverviewViewModel = Pick<InvoiceRecord,
  'chave_acesso' | 'estabelecimento' | 'nota_fiscal' | 'data_emissao' | 'data_referencia' |
  'codigo_cliente' | 'nome_abreviado' | 'uf' | 'cidade' | 'quantidade_galinha' |
  'quantidade_codorna' | 'valor_total'
> & {
  uf: string; cidade: string; status: 'Desconhecida' | 'Finalizada' | 'Pendente'
  responsavel_id?: string | null; responsavel_nome?: string | null
  criado_por?: string | null; criado_por_nome?: string | null
  atualizado_por?: string | null; atualizado_por_nome?: string | null
  promotor_rota_ids?: string[]; promotor_rota_nomes?: string[]
}

export type InvoiceListFilters = {
  restrictedUfs?: string[]
  startDate?: string; endDate?: string; status?: string; uf?: string; city?: string
  responsibleId?: string; createdById?: string; updatedById?: string; routePromoterId?: string
  search?: string; sortBy?: 'loja' | 'nota_fiscal' | 'data_emissao' | 'uf' | 'status'
  direction?: 'asc' | 'desc'; page?: number; pageSize?: number
}
export type InvoiceOverviewPage = {
  rows: InvoiceOverviewViewModel[]
  total: number
  counts: { Finalizada: number; Pendente: number; Desconhecida: number }
  ufs: string[]
  cities: string[]
}

export type StartInvoiceProcessCommand = { storeId: string; accessKey: string }
export type StartInvoiceProcessResult = { processId: string; note: InvoiceRecord }
export type FindInvoiceStoreCommand = { code: string | number; restrictedUfs: string[] }
export type MarkInvoiceUnknownCommand = {
  store: StoreReferenceViewModel
  note: Pick<InvoiceRecord, 'codigo_cliente' | 'nota_fiscal' | 'chave_acesso'>
  comment: string
}
export type RecognizeInvoiceCommand = Pick<MarkInvoiceUnknownCommand, 'note'>['note']
