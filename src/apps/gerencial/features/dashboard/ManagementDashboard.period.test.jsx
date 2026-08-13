import { describe, expect, it } from 'vitest'
import { formatPeriodRange } from './periodIndicatorUtils'

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
