import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPromotorNavigation,
  getPromotorPathFromState,
  getPromotorRoutePath,
  readPromotorNavigation,
  readPromotorRoute,
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

  it('converte cada etapa em URL canonica e reversivel', () => {
    const route = {
      view: 'fstd' as const,
      storeId: 'loja/com espaço',
      invoiceKey: 'NFD/42',
    }
    const pathname = getPromotorRoutePath(route)
    expect(pathname).toBe('/acesso/promotor/lojas/loja%2Fcom%20espa%C3%A7o/notas/NFD%2F42/fstd')
    expect(readPromotorRoute(pathname)).toEqual(route)
  })

  it('resolve rotas legadas e rejeita caminhos desconhecidos', () => {
    expect(readPromotorRoute('/promotor')).toEqual({ view: 'stores' })
    expect(readPromotorRoute('/acesso/promotor/perfil')).toEqual({ view: 'profile' })
    expect(readPromotorRoute('/acesso/promotor/qualquer')).toBeNull()
  })

  it('prioriza a etapa mais profunda do estado visual', () => {
    expect(getPromotorPathFromState({})).toBe('/acesso/promotor/lojas')
    expect(getPromotorPathFromState({ selectedStoreId: 'l1' })).toBe('/acesso/promotor/lojas/l1/notas')
    expect(getPromotorPathFromState({ selectedStoreId: 'l1', selectedNfdKey: 'n1' }))
      .toBe('/acesso/promotor/lojas/l1/notas/n1')
    expect(getPromotorPathFromState({ selectedStoreId: 'l1', fstdTargetKey: 'n1' }))
      .toBe('/acesso/promotor/lojas/l1/notas/n1/fstd')
  })
})
