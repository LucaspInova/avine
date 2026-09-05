import { describe, expect, it } from 'vitest'
import { getUserActivityStatus, isUserActive } from './profile'

describe('user activity status', () => {
  const now = new Date('2026-08-10T12:00:00.000Z').getTime()

  it('considers an access exactly 3 days ago active', () => {
    expect(isUserActive({ last_access_at: '2026-08-07T12:00:00.000Z' }, now)).toBe(true)
    expect(getUserActivityStatus({ last_access_at: '2026-08-07T12:00:00.000Z' }, now)).toBe('active')
  })

  it('considers an access older than 3 days offline', () => {
    expect(isUserActive({ last_access_at: '2026-08-07T11:59:59.999Z' }, now)).toBe(false)
    expect(getUserActivityStatus({ last_access_at: '2026-08-07T11:59:59.999Z' }, now)).toBe('offline')
  })

  it.each([null, '', 'invalid date'])('considers a missing or invalid access inactive', (lastAccessAt) => {
    expect(isUserActive({ last_access_at: lastAccessAt }, now)).toBe(false)
    expect(getUserActivityStatus({ last_access_at: lastAccessAt }, now)).toBe('inactive')
  })

  it.each([
    { ativo: false, acesso_habilitado: true },
    { ativo: true, acesso_habilitado: false },
  ])('distinguishes a blocked account from a user who never signed in', (access) => {
    expect(getUserActivityStatus({ ...access, last_access_at: '2026-08-10T11:00:00.000Z' }, now)).toBe('blocked')
  })
})
