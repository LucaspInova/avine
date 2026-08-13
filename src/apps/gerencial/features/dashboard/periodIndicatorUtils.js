function getDateParts(value) {
  const date = new Date(`${value}T00:00:00`)
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '')
  return { day: String(date.getDate()).padStart(2, '0'), month, year: date.getFullYear() }
}

export function formatPeriodRange(startDate, endDate) {
  if (!startDate || !endDate) return ''
  const start = getDateParts(startDate)
  const end = getDateParts(endDate)
  if (start.year === end.year && start.month === end.month) return `${start.day} a ${end.day} ${end.month}`
  if (start.year === end.year) return `${start.day} ${start.month} a ${end.day} ${end.month}`
  return `${start.day} ${start.month} ${start.year} a ${end.day} ${end.month} ${end.year}`
}
