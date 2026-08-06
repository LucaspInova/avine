import { validateFstdPhoto } from '../model/validation'

type SupabaseLike = any

export function createFstdRepository(client: SupabaseLike) {
  return {
    async startStandalone(input: { storeId: string; number: string; value: number; issueDate: string; products: Array<{ codigo_produto: string }> }) {
      return rpc(client, 'iniciar_fstd_avulsa', { p_loja_id: input.storeId, p_nfd_numero: input.number.trim(), p_nfd_valor: input.value, p_nfd_data_emissao: input.issueDate, p_produtos: input.products })
    },
    startProducts(storeId: string, accessKey: string) {
      return rpc(client, 'iniciar_fstd_produtos_v2', { p_loja_id: storeId, p_nfd_chave_acesso: accessKey })
    },
    saveProduct(rpcName: 'editar_fstd_produto' | 'concluir_fstd_produto_avulso' | 'concluir_fstd_produto', args: Record<string, unknown>) {
      return rpc(client, rpcName, args)
    },
    finalize(processId: string) { return rpc(client, 'finalizar_fstd_produtos', { p_processo_id: processId }) },
    getOrCreateDocument(processId: string) { return rpc(client, 'get_or_create_fstd_document', { p_processo_id: processId }) },
    setDocumentPdf(documentId: string, path: string, metadata: Record<string, unknown>) {
      return rpc(client, 'set_fstd_document_pdf', { p_document_id: documentId, p_pdf_path: path, p_pdf_metadata: metadata })
    },
    async uploadPhoto(bucket: string, path: string, file: File) {
      validateFstdPhoto(file)
      const { data, error } = await client.storage.from(bucket).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (error) throw error
      return data.path as string
    },
    async removeFiles(bucket: string, paths: string[]) {
      if (paths.length === 0) return
      const { error } = await client.storage.from(bucket).remove(paths)
      if (error) throw error
    },
    async createSignedUrl(bucket: string, path: string, expiresIn = 3600) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn)
      if (error) throw error
      return data.signedUrl as string
    },
  }
}

async function rpc(client: SupabaseLike, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}

export type FstdRepository = ReturnType<typeof createFstdRepository>
