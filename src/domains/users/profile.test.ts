import { describe, expect, it } from 'vitest'
import { isUserActive } from './profile'

describe('user activity status', () => {
  const now = new Date('2026-08-10T12:00:00.000Z').getTime()

  it('considers an access exactly 30 days ago active', () => {
    expect(isUserActive({ last_access_at: '2026-07-11T12:00:00.000Z' }, now)).toBe(true)
  })

  it('considers an access older than 30 days inactive', () => {
    expect(isUserActive({ last_access_at: '2026-07-11T11:59:59.999Z' }, now)).toBe(false)
  })

  it.each([null, '', 'invalid date'])('considers a missing or invalid access inactive', (lastAccessAt) => {
    expect(isUserActive({ last_access_at: lastAccessAt }, now)).toBe(false)
  })
})
