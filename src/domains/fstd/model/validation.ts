import { normalizeNonNegativeQuantity, normalizeQuantity } from './calculations'
import type { FstdDivisionDraft } from './types'

export function keepNumericNfdCode(value: unknown): string {
  return String(value ?? '').replace(/[^0-9]/g, '')
}

export const FSTD_ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const FSTD_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

export function validateFstdPhoto(file: Pick<File, 'type' | 'size'>): void {
  if (!FSTD_ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error('Envie fotos nos formatos JPG, PNG ou WebP.')
  if (file.size > FSTD_MAX_FILE_SIZE_BYTES) throw new Error('Cada foto pode ter no máximo 10 MB.')
}

export function validateFstdDivisions(divisions: FstdDivisionDraft[], expectedTotal: number): boolean {
  return divisions.length > 0
    && divisions.every((division) => Boolean(division.reasonId) && normalizeQuantity(division.billed) > 0
      && String(division.returned).trim() !== ''
      && normalizeNonNegativeQuantity(division.returned) <= normalizeQuantity(division.billed))
    && divisions.reduce((sum, division) => sum + normalizeQuantity(division.billed), 0) === expectedTotal
}

export function validateFstdProduct(input: { divisions: FstdDivisionDraft[]; billedTotal: number; photoCount: number }): boolean {
  return input.billedTotal > 0 && input.photoCount > 0 && validateFstdDivisions(input.divisions, input.billedTotal)
}

export function validateFstdFinalization(processId?: string | null): asserts processId is string {
  if (!processId) throw new Error('Conclua todos os produtos antes de finalizar a NFD.')
}
