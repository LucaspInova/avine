import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../../../types/database.types'
import type { RpcArgs, RpcResponse } from '../../../types/database.helpers'
import { validateFstdPhoto } from '../model/validation'
import type { SaveFstdProductCommand, StartStandaloneFstdCommand } from '../model/types'

type FstdRpcName =
  | 'iniciar_fstd_avulsa'
  | 'iniciar_fstd_produtos_v2'
  | 'concluir_fstd_produto'
  | 'concluir_fstd_produto_avulso'
  | 'editar_fstd_produto'
  | 'finalizar_fstd_produtos'
  | 'get_or_create_fstd_document'
  | 'set_fstd_document_pdf'

export function createFstdRepository(client: SupabaseClient<Database>) {
  async function callRpc<Name extends FstdRpcName>(name: Name, args: RpcArgs<Name>) {
    // Supabase cannot correlate a generic RPC name with its argument union at this boundary.
    const { data, error } = await client.rpc(name, args as never)
    if (error) throw error
    return data as RpcResponse<Name>
  }

  return {
    startStandalone(input: StartStandaloneFstdCommand) {
      return callRpc('iniciar_fstd_avulsa', {
        p_loja_id: input.storeId,
        p_nfd_numero: input.number.trim(),
        p_nfd_valor: input.value,
        p_nfd_data_emissao: input.issueDate,
        p_produtos: input.products as Json,
      })
    },
    startProducts(storeId: string, accessKey: string) {
      return callRpc('iniciar_fstd_produtos_v2', { p_loja_id: storeId, p_nfd_chave_acesso: accessKey })
    },
    saveProduct(command: SaveFstdProductCommand) {
      if (command.rpcName === 'concluir_fstd_produto') return callRpc(command.rpcName, command.args)
      if (command.rpcName === 'concluir_fstd_produto_avulso') return callRpc(command.rpcName, command.args)
      return callRpc(command.rpcName, command.args)
    },
    finalize(processId: string) {
      return callRpc('finalizar_fstd_produtos', { p_processo_id: processId })
    },
    getOrCreateDocument(processId: string) {
      return callRpc('get_or_create_fstd_document', { p_processo_id: processId })
    },
    setDocumentPdf(documentId: string, path: string, metadata: Json) {
      return callRpc('set_fstd_document_pdf', { p_document_id: documentId, p_pdf_path: path, p_pdf_metadata: metadata })
    },
    async uploadPhoto(bucket: string, path: string, file: File) {
      validateFstdPhoto(file)
      const { data, error } = await client.storage.from(bucket).upload(path, file, {
        contentType: file.type || 'application/octet-stream', upsert: false,
      })
      if (error) throw error
      return data.path
    },
    async removeFiles(bucket: string, paths: string[]) {
      if (paths.length === 0) return
      const { error } = await client.storage.from(bucket).remove(paths)
      if (error) throw error
    },
    async createSignedUrl(bucket: string, path: string, expiresIn = 3600) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn)
      if (error) throw error
      return data.signedUrl
    },
  }
}

export type FstdRepository = ReturnType<typeof createFstdRepository>
