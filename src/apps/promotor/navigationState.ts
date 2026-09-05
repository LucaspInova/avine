const PROMOTOR_NAVIGATION_KEY = 'fstd-promotor-navigation'

export type PromotorRoute =
  | { view: 'stores' }
  | { view: 'profile' }
  | { view: 'store'; storeId: string }
  | { view: 'manual'; storeId: string }
  | { view: 'invoice'; storeId: string; invoiceKey: string }
  | { view: 'fstd'; storeId: string; invoiceKey: string }
  | { view: 'add-products'; storeId: string; invoiceKey: string }

const PROMOTOR_BASE_PATH = '/acesso/promotor'

function safeDecode(segment: string) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function routeSegment(value: unknown) {
  return encodeURIComponent(String(value ?? ''))
}

export function readPromotorRoute(pathname: string): PromotorRoute | null {
  const segments = pathname.split('/').filter(Boolean)
  const promotorIndex = segments[0] === 'acesso' && segments[1] === 'promotor'
    ? 2
    : segments[0] === 'promotor'
      ? 1
      : -1
  if (promotorIndex < 0) return null

  const route = segments.slice(promotorIndex)
  if (route.length === 0 || (route.length === 1 && route[0] === 'lojas')) return { view: 'stores' }
  if (route.length === 1 && route[0] === 'perfil') return { view: 'profile' }
  if (route[0] !== 'lojas' || !route[1]) return null

  const storeId = safeDecode(route[1])
  if (route.length === 2 || (route.length === 3 && route[2] === 'notas')) {
    return { view: 'store', storeId }
  }
  if (route[2] !== 'notas' || !route[3]) return null
  if (route[3] === 'nova') return { view: 'manual', storeId }

  const invoiceKey = safeDecode(route[3])
  if (route.length === 4) return { view: 'invoice', storeId, invoiceKey }
  if (route.length === 5 && route[4] === 'fstd') return { view: 'fstd', storeId, invoiceKey }
  if (route.length === 5 && route[4] === 'adicionar-produtos') {
    return { view: 'add-products', storeId, invoiceKey }
  }
  return null
}

export function getPromotorRoutePath(route: PromotorRoute) {
  if (route.view === 'stores') return `${PROMOTOR_BASE_PATH}/lojas`
  if (route.view === 'profile') return `${PROMOTOR_BASE_PATH}/perfil`

  const storePath = `${PROMOTOR_BASE_PATH}/lojas/${routeSegment(route.storeId)}/notas`
  if (route.view === 'store') return storePath
  if (route.view === 'manual') return `${storePath}/nova`

  const invoicePath = `${storePath}/${routeSegment(route.invoiceKey)}`
  if (route.view === 'invoice') return invoicePath
  if (route.view === 'fstd') return `${invoicePath}/fstd`
  return `${invoicePath}/adicionar-produtos`
}

type PromotorNavigationSnapshot = {
  isProfilePageOpen?: boolean
  selectedStoreId?: string | number | null
  selectedStore?: { id?: string | number | null } | null
  isAvulsaOpen?: boolean
  avulsaAddProductsKey?: string | null
  avulsaAddProductsTarget?: { chave_acesso?: string | null } | null
  fstdTargetKey?: string | null
  fstdTarget?: { chave_acesso?: string | null } | null
  selectedNfdKey?: string | null
  selectedNfd?: { chave_acesso?: string | null } | null
}

export function getPromotorPathFromState(value: PromotorNavigationSnapshot) {
  if (value.isProfilePageOpen) return getPromotorRoutePath({ view: 'profile' })
  const rawStoreId = value.selectedStoreId ?? value.selectedStore?.id
  const storeId = rawStoreId == null ? '' : String(rawStoreId)
  if (!storeId) return getPromotorRoutePath({ view: 'stores' })
  if (value.isAvulsaOpen) return getPromotorRoutePath({ view: 'manual', storeId })

  const addProductsKey = value.avulsaAddProductsKey
    ?? value.avulsaAddProductsTarget?.chave_acesso
  if (addProductsKey) {
    return getPromotorRoutePath({ view: 'add-products', storeId, invoiceKey: addProductsKey })
  }

  const fstdKey = value.fstdTargetKey ?? value.fstdTarget?.chave_acesso
  if (fstdKey) return getPromotorRoutePath({ view: 'fstd', storeId, invoiceKey: fstdKey })

  const invoiceKey = value.selectedNfdKey ?? value.selectedNfd?.chave_acesso
  if (invoiceKey) return getPromotorRoutePath({ view: 'invoice', storeId, invoiceKey })
  return getPromotorRoutePath({ view: 'store', storeId })
}

function getPromotorNavigationKey(profileId: string) {
  return `${PROMOTOR_NAVIGATION_KEY}:${profileId}`
}

export function readPromotorNavigation(profileId: string) {
  try {
    const value = window.sessionStorage.getItem(getPromotorNavigationKey(profileId))
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

export function savePromotorNavigation(profileId: string, value: unknown) {
  try {
    window.sessionStorage.setItem(
      getPromotorNavigationKey(profileId),
      JSON.stringify(value),
    )
  } catch {
    // Navigation still works in-memory when browser storage is unavailable.
  }
}

export function clearPromotorNavigation(profileId: string) {
  try {
    window.sessionStorage.removeItem(getPromotorNavigationKey(profileId))
  } catch {
    // Logout still completes when browser storage is unavailable.
  }
}
