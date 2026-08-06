import { normalizeNonNegativeQuantity, normalizeQuantity } from './calculations'
import type { FstdDivision } from './types'

export const FSTD_ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const FSTD_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

export function validateFstdPhoto(file: Pick<File, 'type' | 'size'>): void {
  if (!FSTD_ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error('Envie fotos nos formatos JPG, PNG ou WebP.')
  if (file.size > FSTD_MAX_FILE_SIZE_BYTES) throw new Error('Cada foto pode ter no máximo 10 MB.')
}

export function validateFstdDivisions(divisions: FstdDivision[], expectedTotal: number): boolean {
  return divisions.length > 0
    && divisions.every((division) => Boolean(division.motivoId) && normalizeQuantity(division.faturado) > 0
      && String(division.retorno).trim() !== ''
      && normalizeNonNegativeQuantity(division.retorno) <= normalizeQuantity(division.faturado))
    && divisions.reduce((sum, division) => sum + normalizeQuantity(division.faturado), 0) === expectedTotal
}

export function validateFstdProduct(input: { divisions: FstdDivision[]; billedTotal: number; photoCount: number }): boolean {
  return input.billedTotal > 0 && input.photoCount > 0 && validateFstdDivisions(input.divisions, input.billedTotal)
}

export function validateFstdFinalization(processId?: string | null): asserts processId is string {
  if (!processId) throw new Error('Conclua todos os produtos antes de finalizar a NFD.')
}
