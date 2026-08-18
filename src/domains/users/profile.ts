const profileLabels: Record<string, string> = { Admin: 'Admin', Gerencial: 'Gerencial', Promotor: 'Promotor' }

export function isAdministrativeProfile(user: { perfil?: string } | null | undefined) {
  return user?.perfil === 'Admin' || user?.perfil === 'Gerencial'
}

export function isScopedGerencial(user: { perfil?: string; auth_role?: string } | null | undefined) {
  return user?.perfil === 'Gerencial' && user.auth_role === 'gerencial'
}

export function getUserInitials(name: unknown) {
  return String(name ?? '').trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'US'
}

const ACTIVE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export type UserActivityStatus = 'active' | 'offline' | 'inactive'

export function getUserActivityStatus(user: { last_access_at?: string | null }, now = Date.now()): UserActivityStatus {
  if (!user.last_access_at) return 'inactive'

  const lastAccess = new Date(user.last_access_at).getTime()
  if (!Number.isFinite(lastAccess)) return 'inactive'

  return lastAccess >= now - ACTIVE_WINDOW_MS ? 'active' : 'offline'
}

export function isUserActive(user: { last_access_at?: string | null }, now = Date.now()) {
  return getUserActivityStatus(user, now) === 'active'
}

export function getGerencialName(user: any) {
  return user.gerencial_nome ?? user.gerencial?.nome ?? '-'
}

export function getManagedRoleLabel(user: { perfil?: string } | null | undefined) {
  return user?.perfil ? (profileLabels[user.perfil] ?? user.perfil) : ''
}

export function getManagedRoleKey(user: { perfil?: string } | null | undefined) {
  return user?.perfil ?? ''
}
