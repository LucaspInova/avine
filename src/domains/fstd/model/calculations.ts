import type { FstdDivisionDraft, FstdProductViewModel } from './types'

export function normalizeQuantity(value: unknown): number {
  const quantity = Number.parseInt(String(value), 10)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0
}

export function normalizeNonNegativeQuantity(value: unknown): number {
  const quantity = Number.parseInt(String(value), 10)
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : 0
}

export function getFstdDivisionDefaults(product: FstdProductViewModel): FstdDivisionDraft[] {
  const persistedDivisions = product.divisions
      .filter((division) => division.motivo_id && normalizeQuantity(division.quantidade_faturada) > 0)
      .map((division) => ({
        reasonId: String(division.motivo_id),
        billed: String(normalizeQuantity(division.quantidade_faturada)),
        returned: String(normalizeQuantity(division.quantidade)),
      }))
  if (persistedDivisions.length > 0) return persistedDivisions

  const galinha = Number(product.quantidade_faturada_galinha)
  const codorna = Number(product.quantidade_faturada_codorna)
  if (product.motivo_id && galinha + codorna > 0) {
    return [{ reasonId: product.motivo_id, billed: String(galinha + codorna), returned: String(normalizeQuantity(product.quantidade_retorno)) }]
  }
  return [{ reasonId: '', billed: String(Math.max(0, galinha + codorna)), returned: '' }]
}

export function splitBilledQuantity(product: Pick<FstdProductViewModel, 'quantidade_faturada_galinha' | 'quantidade_faturada_codorna'>, total: number) {
  const galinha = Number(product.quantidade_faturada_galinha ?? 0)
  const codorna = Number(product.quantidade_faturada_codorna ?? 0)
  if (codorna > 0 && galinha === 0) return { galinha: 0, codorna: total }
  if (galinha > 0 && codorna === 0) return { galinha: total, codorna: 0 }
  return { galinha: Math.min(galinha, total), codorna: Math.max(0, total - Math.min(galinha, total)) }
}
