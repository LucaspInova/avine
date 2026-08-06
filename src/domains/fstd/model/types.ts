export type FstdQuantity = number | string

export interface FstdDivision {
  motivoId: string
  faturado: FstdQuantity
  retorno: FstdQuantity
}

export interface FstdReason {
  id: string
  nome?: string
  descricao?: string
}

export interface FstdPhoto {
  path: string
  url?: string
  file?: File
}

export interface FstdProduct {
  id?: string
  codigo_produto: string
  nome?: string
  quantidade_faturada_galinha?: number
  quantidade_faturada_codorna?: number
  quantidade_retorno?: number
  is_avulsa?: boolean
  persisted?: {
    id?: string
    status?: string
    motivo_id?: string
    quantidade_faturada_galinha?: number
    quantidade_faturada_codorna?: number
    quantidade_retorno?: number
    divisoes?: Array<Record<string, unknown>>
    fotos?: string[]
  }
}

export interface FstdProcess {
  id: string
  status: string
  produtos?: FstdProduct[]
  nfd_chave_acesso?: string
  nfd_numero?: string
}

export interface FstdDocument {
  id: string
  numero_controle: string
  pdf_path?: string | null
  pdf_metadata?: Record<string, unknown> | null
}
