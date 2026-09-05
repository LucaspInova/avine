function toDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function getDefaultPeriodDates(now = new Date()) {
  const isFirstDayOfMonth = now.getDate() === 1
  const start = isFirstDayOfMonth
    ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
    : new Date(now.getFullYear(), now.getMonth(), 1)
  const end = isFirstDayOfMonth
    ? new Date(now.getFullYear(), now.getMonth(), 0)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  return { startDate: toDateInput(start), endDate: toDateInput(end) }
}
