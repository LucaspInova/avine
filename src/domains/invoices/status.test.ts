import { describe, expect, it } from 'vitest'
import { getDaysSinceIssue, getNfdTabStatus, getNfdVisualStatus } from './status'

describe('status visual e aba da NFD', () => {
  const now = new Date(2026, 7, 6, 12)
  it.each([
    [{ is_avulsa: true, conferencia_status: 'divergente' }, 'avulsa-erro', 'avulsa'],
    [{ is_avulsa: true, fstd_process_status: 'concluida', conferencia_status: 'conferida' }, 'sent', 'finalizada'],
    [{ data_envio: '2026-08-06' }, 'sent', 'finalizada'],
    [{ data_emissao: '2026-08-05' }, 'overdue', 'atrasada'],
    [{ data_emissao: '2026-08-06' }, 'on-time', 'outros'],
  ])('classifica %o como %s na aba %s', (note, visual, tab) => {
    expect(getNfdVisualStatus(note, {}, now)).toBe(visual)
    expect(getNfdTabStatus(note, {}, now)).toBe(tab)
  })
  it('prioriza o desconhecimento e calcula por dias civis', () => {
    const note = { codigo_cliente: 10, nota_fiscal: 20, data_emissao: '2026-08-06' }
    expect(getNfdVisualStatus(note, { '10:20': 'motivo' }, now)).toBe('unknown')
    expect(getDaysSinceIssue('2026-08-05', now)).toBe(1)
  })
})
