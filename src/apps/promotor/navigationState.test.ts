import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPromotorNavigation,
  readPromotorNavigation,
  savePromotorNavigation,
} from './navigationState'

describe('Promotor navigation state', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('isolates navigation by profile on a shared device', () => {
    savePromotorNavigation('profile-a', { screen: 'fstd', storeId: 'store-a' })
    savePromotorNavigation('profile-b', { screen: 'stores' })

    expect(readPromotorNavigation('profile-a')).toEqual({
      screen: 'fstd',
      storeId: 'store-a',
    })
    expect(readPromotorNavigation('profile-b')).toEqual({ screen: 'stores' })
  })

  it('clears only the profile that logged out', () => {
    savePromotorNavigation('profile-a', { screen: 'fstd' })
    savePromotorNavigation('profile-b', { screen: 'stores' })

    clearPromotorNavigation('profile-a')

    expect(readPromotorNavigation('profile-a')).toBeNull()
    expect(readPromotorNavigation('profile-b')).toEqual({ screen: 'stores' })
  })
})
