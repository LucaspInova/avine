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

export function isUserActive(user: { ativo?: boolean; acesso_habilitado?: boolean }) {
  return user.ativo === true && user.acesso_habilitado === true
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
