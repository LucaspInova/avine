import { supabase } from '../../../shared/lib/supabaseClient'
import { toAppError } from '../../../shared/errors'
import { fetchAllNfdNotas } from '../../invoices'
import { sortStoresByCode } from '../../stores'

async function result<T>(request: any): Promise<T> {
  const { data, error } = await request
  if (error) throw toAppError(error)
  return data
}

export async function listPromotorStores() {
  const data = await result<any[]>(supabase!.from('lojas').select('id, codigo, nome, uf, cidade').order('nome', { ascending: true }))
  return sortStoresByCode(data ?? [])
}

export async function listPromotorInvoices(stores: any[]) {
  const byCode = new Map(stores.map((store) => [String(store.codigo), store]))
  const codes = [...byCode.keys()].map(Number).filter(Number.isFinite)
  if (!codes.length) return []
  const notes = await fetchAllNfdNotas('chave_acesso, nota_fiscal, data_emissao, codigo_cliente, nome_abreviado, uf, cidade, quantidade_galinha, quantidade_codorna, valor_total, detalhes', (query) => query.in('codigo_cliente', codes).order('data_emissao', { ascending: false }).order('nota_fiscal', { ascending: false }))
  return notes.map((note: any) => { const store = byCode.get(String(note.codigo_cliente)); return { ...note, id: note.chave_acesso, loja_id: store?.id ?? null, loja_codigo: String(note.codigo_cliente), loja_nome: note.nome_abreviado, numero: String(note.nota_fiscal), status_nfd: 'outros', fstd_id: null, fstd_status: null } })
}

export const listProductCatalog = () => result<any[]>(supabase!.from('produtos_expandidos').select('produto_id, codigo_produto, nome, ovos_und, categoria, imagem_url').eq('status', true).order('nome', { ascending: true })).then((data) => data ?? [])
export const listReturnReasons = () => result<any[]>(supabase!.from('motivos_devolucao').select('id, nome, ordem, ativo').order('ordem', { ascending: true }).order('nome', { ascending: true })).then((data) => data ?? [])

export async function listUnknownInvoices(profile: any) {
  let query = supabase!.from('nfd_desconhecimentos').select('nfd_referencia, comentario, created_at').is('reconhecida_em', null).order('created_at', { ascending: false })
  if (!['Admin', 'Gerencial'].includes(profile.perfil)) query = query.eq('promotor_id', profile.id)
  return (await result<any[]>(query)) ?? []
}

export async function listFstdProcesses() {
  const processes = (await result<any[]>(supabase!.from('fstd_processos').select('id, nfd_chave_acesso, nfd_numero, loja_id, is_avulsa, nfd_data_emissao, nfd_valor, conferencia_status, conferencia_detalhes, conferencia_em, api_nfd_chave_acesso, status, finalizada_em').order('created_at', { ascending: false }))) ?? []
  if (!processes.length) return []
  const products = (await result<any[]>(supabase!.from('fstd_produtos').select('id, processo_id, produto_id, codigo_produto, nome, descricao, imagem_url, quantidade_faturada_galinha, quantidade_faturada_codorna, quantidade_retorno, motivo_id, observacao, fotos, status, concluido_em').in('processo_id', processes.map((item) => item.id)))) ?? []
  const productIds = products.map((item) => item.id)
  const divisions = productIds.length ? (await result<any[]>(supabase!.from('fstd_produto_motivos').select('produto_id, motivo_id, quantidade_faturada, quantidade').in('produto_id', productIds))) ?? [] : []
  return processes.map((process) => ({ ...process, produtos: products.filter((product) => product.processo_id === process.id).map((product) => ({ ...product, divisoes: divisions.filter((division) => division.produto_id === product.id) })) }))
}
