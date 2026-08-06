export function normalizeUf(uf: unknown) {
  return String(uf ?? '').trim().toUpperCase()
}

export function isMesmoUf(loja: { uf?: string } | null | undefined, promotor: { estado?: string } | null | undefined) {
  return normalizeUf(loja?.uf) === normalizeUf(promotor?.estado)
}

export function compareStoreCodes(left: { codigo?: unknown }, right: { codigo?: unknown }) {
  const leftCode = String(left?.codigo ?? '').trim(); const rightCode = String(right?.codigo ?? '').trim()
  const leftNumber = Number(leftCode); const rightNumber = Number(rightCode)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) return leftNumber - rightNumber
  return leftCode.localeCompare(rightCode, 'pt-BR', { numeric: true, sensitivity: 'base' })
}

export function sortStoresByCode<T extends { codigo?: unknown }>(stores: T[] | null | undefined) {
  return [...(stores ?? [])].sort(compareStoreCodes)
}
