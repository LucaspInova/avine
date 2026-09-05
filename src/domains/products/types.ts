export type CatalogProduct = {
  id: string
  status: boolean | null
  nome: string | null
  codigos_vinculados: string | null
  ovos_und: number | null
  categoria: string | null
  imagem_url: string | null
}

export type PendingProduct = {
  codigo_produto: string
  descricao_produto: string | null
  itens_count: number
  notas_count: number
  ultima_data: string | null
  quantidade_galinha: number
  quantidade_codorna: number
  produto_sugerido_id: string | null
  produto_sugerido_nome: string | null
  similaridade: number | null
}

export type SaveCatalogProduct = {
  id?: string | null
  nome: string
  codigos: string[]
  ovosUnd: number
  categoria: string
  imagemUrl?: string | null
  status?: boolean
}
