export function compareStoreCodes(left, right) {
  const leftCode = String(left?.codigo ?? '').trim()
  const rightCode = String(right?.codigo ?? '').trim()
  const leftNumber = Number(leftCode)
  const rightNumber = Number(rightCode)

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber
  }

  return leftCode.localeCompare(rightCode, 'pt-BR', { numeric: true, sensitivity: 'base' })
}

export function sortStoresByCode(stores) {
  return [...(stores ?? [])].sort(compareStoreCodes)
}
