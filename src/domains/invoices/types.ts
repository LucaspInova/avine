import type { TableRow, ViewRow } from '../../types/database.helpers'
import type { StoreReferenceViewModel } from '../stores/types'

export type InvoiceRecord = ViewRow<'nfd_notas'>
export type InvoiceItemRecord = TableRow<'nfd_itens'>
export type UnknownInvoiceRecord = TableRow<'nfd_desconhecimentos'>

export type InvoiceOverviewViewModel = Pick<InvoiceRecord,
  'chave_acesso' | 'estabelecimento' | 'nota_fiscal' | 'data_emissao' | 'data_referencia' |
  'codigo_cliente' | 'nome_abreviado' | 'uf' | 'cidade' | 'quantidade_galinha' |
  'quantidade_codorna' | 'valor_total'
> & { uf: string; cidade: string; status: 'Desconhecida' | 'Finalizada' | 'Pendente' }

export type StartInvoiceProcessCommand = { storeId: string; accessKey: string }
export type FindInvoiceStoreCommand = { code: string | number; restrictedUfs: string[] }
export type MarkInvoiceUnknownCommand = {
  store: StoreReferenceViewModel
  note: Pick<InvoiceRecord, 'codigo_cliente' | 'nota_fiscal' | 'chave_acesso'>
  comment: string
}
export type RecognizeInvoiceCommand = Pick<MarkInvoiceUnknownCommand, 'note'>['note']
