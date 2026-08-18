import { describe, expect, it } from 'vitest'
import { getDefaultPeriodDates } from './periodDateUtils'
import { formatPeriodRange } from './periodIndicatorUtils'

describe('período padrão do dashboard', () => {
  it('começa no primeiro dia do mês atual e termina ontem', () => {
    expect(getDefaultPeriodDates(new Date(2026, 7, 18, 12))).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-17',
    })
  })
})

describe('indicador de período', () => {
  it('formata um intervalo no mesmo mês', () => {
    expect(formatPeriodRange('2026-08-06', '2026-08-13')).toBe('06 a 13 ago')
  })

  it('inclui os meses quando o intervalo atravessa meses', () => {
    expect(formatPeriodRange('2026-07-28', '2026-08-03')).toBe('28 jul a 03 ago')
  })

  it('inclui os anos quando necessário', () => {
    expect(formatPeriodRange('2025-12-31', '2026-01-02')).toBe('31 dez 2025 a 02 jan 2026')
  })
})
