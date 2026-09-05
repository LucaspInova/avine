import { supabase } from '../../shared/lib/supabaseClient'
import { toAppError } from '../../shared/errors'
import type { CatalogProduct, PendingProduct, SaveCatalogProduct } from './types'

const PRODUCT_IMAGE_MAX_SIZE = 5 * 1024 * 1024
const PRODUCT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function splitProductCodes(value: string | null | undefined) {
  return [...new Set((value ?? '')
    .split(';')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean))]
}

export function validateProductImage(file: File) {
  if (!PRODUCT_IMAGE_TYPES.has(file.type)) throw new Error('Use uma imagem JPG, PNG ou WebP.')
  if (file.size > PRODUCT_IMAGE_MAX_SIZE) throw new Error('A imagem deve ter no máximo 5 MB.')
}

export function createProductsRepository(client: any) {
  async function listProducts(): Promise<CatalogProduct[]> {
    const { data, error } = await client
      .from('produtos')
      .select('id, status, nome, codigos_vinculados, ovos_und, categoria, imagem_url')
      .order('nome', { ascending: true })
    if (error) throw toAppError(error)
    return data ?? []
  }

  async function listPendingProducts(): Promise<PendingProduct[]> {
    const { data, error } = await client
      .from('produtos_pendentes')
      .select('codigo_produto, descricao_produto, itens_count, notas_count, ultima_data, quantidade_galinha, quantidade_codorna, produto_sugerido_id, produto_sugerido_nome, similaridade')
      .order('notas_count', { ascending: false })
      .order('codigo_produto', { ascending: true })
    if (error) throw toAppError(error)
    return data ?? []
  }

  async function saveProduct(input: SaveCatalogProduct): Promise<CatalogProduct> {
    const { data, error } = await client.rpc('salvar_produto_catalogo', {
      p_produto_id: input.id ?? null,
      p_nome: input.nome,
      p_codigos: input.codigos,
      p_ovos_und: input.ovosUnd,
      p_categoria: input.categoria,
      p_imagem_url: input.imagemUrl ?? null,
      p_status: input.status ?? true,
    })
    if (error) throw toAppError(error)
    return data
  }

  async function linkProductCode(productId: string, code: string): Promise<CatalogProduct> {
    const { data, error } = await client.rpc('vincular_codigo_produto', {
      p_produto_id: productId,
      p_codigo: code,
    })
    if (error) throw toAppError(error)
    return data
  }

  async function uploadProductImage(file: File): Promise<string> {
    validateProductImage(file)
    const { data: authData, error: authError } = await client.auth.getUser()
    if (authError || !authData?.user?.id) throw new Error('Sessão inválida para enviar a imagem.')
    const extension = file.name.split('.').pop()?.toLowerCase() || file.type.split('/')[1] || 'webp'
    const path = `${authData.user.id}/${crypto.randomUUID()}.${extension}`
    const { error } = await client.storage.from('product-images').upload(path, file, { upsert: false })
    if (error) throw toAppError(error)
    return client.storage.from('product-images').getPublicUrl(path).data.publicUrl
  }

  return { listProducts, listPendingProducts, saveProduct, linkProductCode, uploadProductImage }
}

const repository = createProductsRepository(supabase)
export const { listProducts, listPendingProducts, saveProduct, linkProductCode, uploadProductImage } = repository
