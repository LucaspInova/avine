import type { Database } from './database.types'

export type PublicSchema = Database['public']
export type TableName = keyof PublicSchema['Tables']
export type ViewName = keyof PublicSchema['Views']
export type FunctionName = keyof PublicSchema['Functions']

export type TableRow<Name extends TableName> = PublicSchema['Tables'][Name]['Row']
export type TableInsert<Name extends TableName> = PublicSchema['Tables'][Name]['Insert']
export type TableUpdate<Name extends TableName> = PublicSchema['Tables'][Name]['Update']
export type ViewRow<Name extends ViewName> = PublicSchema['Views'][Name]['Row']
export type RpcArgs<Name extends FunctionName> = PublicSchema['Functions'][Name]['Args']
export type RpcResponse<Name extends FunctionName> = PublicSchema['Functions'][Name]['Returns']
