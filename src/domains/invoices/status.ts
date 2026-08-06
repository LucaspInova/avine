export type NfdVisualStatus = 'avulsa-erro' | 'avulsa-finalizada' | 'avulsa' | 'sent' | 'unknown' | 'overdue' | 'on-time'

export function getNfdKey(nfd: Record<string, unknown> | null | undefined): string {
  return `${nfd?.codigo_cliente ?? nfd?.loja_codigo ?? ''}:${nfd?.nota_fiscal ?? nfd?.numero ?? ''}`
}

export function getDaysSinceIssue(date: unknown, now = new Date()): number {
  if (!date) return 0
  const issueDate = new Date(`${date}T00:00:00`)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.floor((todayStart.getTime() - issueDate.getTime()) / 86400000)
}

export function getNfdVisualStatus(nfd: any, unknownComments: Record<string, unknown> = {}, now = new Date()): NfdVisualStatus {
  if (nfd?.is_avulsa) {
    if (nfd.conferencia_status === 'divergente') return 'avulsa-erro'
    if (nfd.fstd_process_status === 'concluida') return nfd.conferencia_status === 'conferida' ? 'sent' : 'avulsa-finalizada'
    return 'avulsa'
  }
  if (unknownComments[getNfdKey(nfd)]) return 'unknown'
  if (nfd?.data_envio || (nfd?.fstd_status && nfd.fstd_status !== 'cancelada')) return 'sent'
  return getDaysSinceIssue(nfd?.data_emissao, now) >= 1 ? 'overdue' : 'on-time'
}

export function getNfdTabStatus(nfd: any, unknownComments: Record<string, unknown> = {}, now = new Date()) {
  const status = getNfdVisualStatus(nfd, unknownComments, now)
  if (status === 'sent') return 'finalizada'
  if (status === 'overdue') return 'atrasada'
  if (status.startsWith('avulsa')) return 'avulsa'
  return 'outros'
}
