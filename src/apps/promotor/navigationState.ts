const PROMOTOR_NAVIGATION_KEY = 'fstd-promotor-navigation'

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
