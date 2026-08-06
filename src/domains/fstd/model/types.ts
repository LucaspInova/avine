import type { Json } from '../../../types/database.types'
import type { RpcResponse, TableRow } from '../../../types/database.helpers'

export type FstdProcessRecord = TableRow<'fstd_processos'>
export type FstdProductRecord = TableRow<'fstd_produtos'>
export type FstdProductReasonRecord = TableRow<'fstd_produto_motivos'>
export type FstdDocumentRecord = TableRow<'fstd_documentos'>

export type FstdQuantityDraft = number | string
export type FstdDivisionDraft = { reasonId: string; billed: FstdQuantityDraft; returned: FstdQuantityDraft }
export type FstdProductDraft = Pick<FstdProductRecord, 'id' | 'codigo_produto' | 'nome'> & {
  billedChicken: FstdQuantityDraft
  billedQuail: FstdQuantityDraft
  returned: FstdQuantityDraft
  divisions: FstdDivisionDraft[]
  observation: string
  newPhotos: File[]
  persistedPhotoPaths: string[]
}

export type StartStandaloneFstdCommand = {
  storeId: string
  number: string
  value: number
  issueDate: string
  products: Array<{ codigo_produto: string }>
}
export type StartProductsFstdCommand = { storeId: string; accessKey: string }
export type SaveFstdProductCommand =
  | { rpcName: 'concluir_fstd_produto'; args: import('../../../types/database.helpers').RpcArgs<'concluir_fstd_produto'> }
  | { rpcName: 'concluir_fstd_produto_avulso'; args: import('../../../types/database.helpers').RpcArgs<'concluir_fstd_produto_avulso'> }
  | { rpcName: 'editar_fstd_produto'; args: import('../../../types/database.helpers').RpcArgs<'editar_fstd_produto'> }

export type StartFstdRpcResponse = RpcResponse<'iniciar_fstd_avulsa'>
export type SaveFstdProductRpcResponse = RpcResponse<'concluir_fstd_produto'>
export type FinalizeFstdRpcResponse = RpcResponse<'finalizar_fstd_produtos'>
export type FstdDocumentRpcResponse = RpcResponse<'get_or_create_fstd_document'>

export type FstdProductViewModel = FstdProductRecord & { divisions: FstdProductReasonRecord[] }
export type FstdProcessViewModel = FstdProcessRecord & { products: FstdProductViewModel[] }

export type FstdFlowState =
  | { status: 'loading' }
  | { status: 'editing'; process: FstdProcessViewModel; draft: FstdProductDraft }
  | { status: 'finalizing'; process: FstdProcessViewModel }
  | { status: 'finalized'; process: FstdProcessViewModel; document: FstdDocumentRecord | null }
  | { status: 'error'; message: string; cause?: unknown }

export type FstdPdfMetadata = Json
