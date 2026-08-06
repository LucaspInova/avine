import type { FstdDivision, FstdProduct } from './types'

export function normalizeQuantity(value: unknown): number {
  const quantity = Number.parseInt(String(value), 10)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0
}

export function normalizeNonNegativeQuantity(value: unknown): number {
  const quantity = Number.parseInt(String(value), 10)
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : 0
}

export function getFstdDivisionDefaults(product: FstdProduct): FstdDivision[] {
  const persistedDivisions = Array.isArray(product.persisted?.divisoes)
    ? product.persisted.divisoes
      .filter((division) => division?.motivo_id && normalizeQuantity(division.quantidade_faturada ?? division.quantidade) > 0)
      .map((division) => ({
        motivoId: String(division.motivo_id),
        faturado: String(normalizeQuantity(division.quantidade_faturada ?? division.quantidade)),
        retorno: String(normalizeQuantity(division.quantidade_retorno ?? division.quantidade)),
      }))
    : []
  if (persistedDivisions.length > 0) return persistedDivisions

  const galinha = Number(product.persisted?.quantidade_faturada_galinha ?? product.quantidade_faturada_galinha ?? 0)
  const codorna = Number(product.persisted?.quantidade_faturada_codorna ?? product.quantidade_faturada_codorna ?? 0)
  if (product.persisted?.motivo_id && galinha + codorna > 0) {
    return [{ motivoId: product.persisted.motivo_id, faturado: String(galinha + codorna), retorno: String(normalizeQuantity(product.persisted.quantidade_retorno)) }]
  }
  return [{ motivoId: '', faturado: String(Math.max(0, galinha + codorna)), retorno: '' }]
}

export function splitBilledQuantity(product: FstdProduct, total: number) {
  const galinha = Number(product.quantidade_faturada_galinha ?? 0)
  const codorna = Number(product.quantidade_faturada_codorna ?? 0)
  if (codorna > 0 && galinha === 0) return { galinha: 0, codorna: total }
  if (galinha > 0 && codorna === 0) return { galinha: total, codorna: 0 }
  return { galinha: Math.min(galinha, total), codorna: Math.max(0, total - Math.min(galinha, total)) }
}
