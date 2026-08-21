export type DashboardStatus = 'Finalizada' | 'Pendente' | 'Desconhecida'

export type ManagementDashboardFilters = {
  startDate: string
  endDate: string
  status?: DashboardStatus | ''
  uf?: string
  city?: string
}

export type DashboardNote = {
  chave_acesso: string | null
  estabelecimento: string | null
  nota_fiscal: number | null
  data_emissao: string | null
  data_referencia: string | null
  codigo_cliente: number | null
  nome_abreviado: string | null
  uf: string
  cidade: string
  quantidade_galinha: number | null
  quantidade_codorna: number | null
  valor_total: number | null
  status: DashboardStatus
}

export type DashboardNoteCollection = {
  notes: DashboardNote[]
  ufs: string[]
  cities: string[]
}

export type DashboardFstdProcess = {
  id: string
  nfd_chave_acesso: string
  status: 'em_andamento' | 'concluida' | 'cancelada'
  finalizada_em: string | null
  created_at: string
  is_avulsa: boolean
}

export type DashboardFstdProduct = {
  id: string
  processo_id: string
  produto_id: string | null
  codigo_produto: string
  nome: string
  quantidade_faturada_galinha: number
  quantidade_faturada_codorna: number
  quantidade_retorno: number
  motivo_id: string | null
  status: 'pendente' | 'concluido'
}

export type DashboardInvoiceItem = {
  chave_acesso: string
  codigo_produto: string
  quantidade_galinha: number
  valor_galinha: number
  quantidade_codorna: number
  valor_codorna: number
}

export type DashboardProductReason = {
  produto_id: string
  motivo_id: string
  quantidade_faturada: number
  quantidade: number
}

export type DashboardReason = {
  id: string
  nome: string
}

export type DashboardCatalogProduct = {
  id: string
  nome: string | null
  categoria: string | null
}

export type DashboardStore = {
  name: string
  billed: number
  returned: number
  returns: number
  returnPercentage: number
}

export type DashboardLegacyFstd = {
  legado_id: number
  codigo_loja: string
  numero_nfd: string
  data_preenchimento: string | null
  motivo: string | null
  qtd_total_galinha: number | null
  qtd_retorno_galinha: number | null
  qtd_total_codorna: number | null
  qtd_retorno_codorna: number | null
}

export type DashboardUnknownNfd = {
  nfd_chave_acesso: string | null
  nfd_referencia: string
  loja_codigo: string | null
  nfd_numero: string
}

export type DashboardSourceError = {
  source: string
  message: string
}

export type ManagementDashboardSource = {
  current: DashboardNoteCollection
  previous: DashboardNoteCollection
  processes: DashboardFstdProcess[]
  invoiceItems: DashboardInvoiceItem[]
  products: DashboardFstdProduct[]
  productReasons: DashboardProductReason[]
  reasons: DashboardReason[]
  catalogProducts: DashboardCatalogProduct[]
  legacy: DashboardLegacyFstd[]
  sourceErrors: DashboardSourceError[]
}
