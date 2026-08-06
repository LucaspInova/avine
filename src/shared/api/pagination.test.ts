import { describe, expect, it, vi } from 'vitest'
import { paginateSupabase } from './pagination'
import { AppError } from '../errors'

describe('paginateSupabase', () => {
  it('combines pages and uses inclusive ranges', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ data: [1, 2], error: null })
      .mockResolvedValueOnce({ data: [3], error: null })

    await expect(paginateSupabase(query, 2)).resolves.toEqual([1, 2, 3])
    expect(query).toHaveBeenNthCalledWith(1, 0, 1)
    expect(query).toHaveBeenNthCalledWith(2, 2, 3)
  })

  it('converts database failures to application errors', async () => {
    const query = vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } })
    await expect(paginateSupabase(query)).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<AppError>)
  })
})
