export function getGaugeTone(value) {
  const percentage = Math.max(0, Math.min(100, Number(value ?? 0)))
  if (percentage < 30) return 'danger'
  if (percentage < 70) return 'warning'
  return 'success'
}
