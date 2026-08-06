import { describe, expect, it } from 'vitest'
import { toAppError } from './AppError'

describe('toAppError', () => {
  it('does not expose technical Supabase messages', () => {
    const error = toAppError({ code: '23505', message: 'duplicate key violates constraint usuarios_email_key' })
    expect(error.code).toBe('CONFLICT')
    expect(error.message).toBe('Este registro já existe ou está sendo utilizado.')
  })

  it('keeps a stable application error unchanged', () => {
    const error = toAppError({ status: 401, message: 'invalid JWT' })
    expect(toAppError(error)).toBe(error)
  })
})
