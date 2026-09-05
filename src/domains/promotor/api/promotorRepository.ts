import { supabase } from '../../../shared/lib/supabaseClient'
import { toAppError } from '../../../shared/errors'
import { fetchAllNfdNotas } from '../../invoices'
import { sortStoresByCode } from '../../stores'
import { paginateSupabase } from '../../../shared/api/pagination'

async function result<T>(request: any): Promise<T> {
  const { data, error } = await request
  if (error) throw toAppError(error)
  return data
}

export function getPromotorNfdStartDate(now = new Date()) {
  const cutoff = new Date(now)
  const dayOfMonth = cutoff.getDate()
  cutoff.setDate(1)
  cutoff.setMonth(cutoff.getMonth() - 1)
  const lastDayOfTargetMonth = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate()
  cutoff.setDate(Math.min(dayOfMonth, lastDayOfTargetMonth))
  cutoff.setHours(0, 0, 0, 0)

  const offset = cutoff.getTimezoneOffset() * 60000
  return new Date(cutoff.getTime() - offset).toISOString().slice(0, 10)
}

export async function listPromotorStores() {
  const data = await result<any[]>(supabase!.from('lojas').select('id, codigo, nome, uf, cidade').order('nome', { ascending: true }))
  return sortStoresByCode(data ?? [])
}

export async function listPromotorInvoices(stores: any[]) {
  const byCode = new Map(stores.map((store) => [String(store.codigo), store]))
  const codes = [...byCode.keys()].map(Number).filter(Number.isFinite)
  if (!codes.length) return []
  const startDate = getPromotorNfdStartDate()
  const notes = await fetchAllNfdNotas('chave_acesso, nota_fiscal, data_emissao, codigo_cliente, nome_abreviado, uf, cidade, quantidade_galinha, quantidade_codorna, valor_total, detalhes', (query) => query
    .in('codigo_cliente', codes)
    .gte('data_emissao', startDate)
    .order('data_emissao', { ascending: false })
    .order('nota_fiscal', { ascending: false }))
  const legacy = await paginateSupabase<any>((from, to) => supabase!.from('fstd_legado_canonico').select('legado_id, codigo_loja, numero_nfd, numero_controle, data_preenchimento, responsavel_fstd, motivo, qtd_total_galinha, qtd_retorno_galinha, qtd_total_codorna, qtd_retorno_codorna, id').in('codigo_loja', codes.map(String)).order('legado_id', { ascending: false }).range(from, to))
  const legacyByKey = new Map(legacy.map((item) => [`${item.codigo_loja}:${item.numero_nfd}`, item]))
  return notes.map((note: any) => {
    const store = byCode.get(String(note.codigo_cliente))
    const legado = legacyByKey.get(`${note.codigo_cliente}:${note.nota_fiscal}`)
    return { ...note, id: note.chave_acesso, loja_id: store?.id ?? null, loja_codigo: String(note.codigo_cliente), loja_nome: note.nome_abreviado, numero: String(note.nota_fiscal), status_nfd: legado ? 'finalizada' : 'outros', visual_status: legado ? 'sent' : undefined, fstd_legado: legado ?? null, fstd_id: null, fstd_status: null }
  })
}

export async function getLegacyFstd(codigoLoja: string | number, numeroNfd: string | number) {
  const { data, error } = await supabase!.rpc('obter_fstd_legado', { p_codigo_loja: String(codigoLoja), p_numero_nfd: String(numeroNfd) })
  if (error) throw toAppError(error)
  return Array.isArray(data) ? data[0] ?? null : data
}

export const listProductCatalog = () => result<any[]>(supabase!.from('produtos_expandidos').select('produto_id, codigo_produto, nome, ovos_und, categoria, imagem_url').eq('status', true).order('nome', { ascending: true })).then((data) => data ?? [])
export const listReturnReasons = () => result<any[]>(supabase!.from('motivos_devolucao').select('id, nome, ordem, ativo').order('ordem', { ascending: true }).order('nome', { ascending: true })).then((data) => data ?? [])

export async function listUnknownInvoices(profile: any) {
  let query = supabase!.from('nfd_desconhecimentos').select('nfd_referencia, comentario, created_at').is('reconhecida_em', null).order('created_at', { ascending: false })
  if (!['Admin', 'Gerencial'].includes(profile.perfil)) query = query.eq('usuario_id', profile.id)
  return (await result<any[]>(query)) ?? []
}

const fstdProcessSelect = 'id, nfd_chave_acesso, nfd_numero, loja_id, promotor_id, criado_por, atualizado_por, is_avulsa, nfd_data_emissao, nfd_valor, conferencia_status, conferencia_detalhes, conferencia_em, api_nfd_chave_acesso, status, finalizada_em'
const fstdProductSelect = 'id, processo_id, produto_id, codigo_produto, nome, descricao, imagem_url, quantidade_faturada_galinha, quantidade_faturada_codorna, quantidade_retorno, motivo_id, observacao, fotos, status, concluido_em'

async function hydrateFstdProcesses(processes: any[]) {
  if (!processes.length) return []
  const products = (await result<any[]>(supabase!.from('fstd_produtos').select(fstdProductSelect).in('processo_id', processes.map((item) => item.id)))) ?? []
  const productIds = products.map((item) => item.id)
  const divisions = productIds.length ? (await result<any[]>(supabase!.from('fstd_produto_motivos').select('produto_id, motivo_id, quantidade_faturada, quantidade').in('produto_id', productIds))) ?? [] : []
  return processes.map((process) => ({ ...process, produtos: products.filter((product) => product.processo_id === process.id).map((product) => ({ ...product, divisoes: divisions.filter((division) => division.produto_id === product.id) })) }))
}

export async function listFstdProcesses() {
  const processes = (await result<any[]>(supabase!.from('fstd_processos').select(fstdProcessSelect).order('created_at', { ascending: false }))) ?? []
  return hydrateFstdProcesses(processes)
}

export async function listFstdProcessesForNfd(accessKey: string) {
  const processes = (await result<any[]>(supabase!.from('fstd_processos')
    .select(fstdProcessSelect)
    .eq('nfd_chave_acesso', accessKey)
    .order('created_at', { ascending: false })
    .limit(1))) ?? []
  return hydrateFstdProcesses(processes)
}
