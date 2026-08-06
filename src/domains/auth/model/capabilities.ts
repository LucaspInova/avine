export const capabilities = [
  'users.read',
  'users.managePromoters',
  'users.manageGerencial',
  'stores.read',
  'stores.create',
  'stores.routePromoters',
  'invoices.read',
  'invoices.markUnknown',
  'fstd.create',
  'fstd.editFinalized',
  'admin.runRestrictedOperations',
] as const

export type Capability = (typeof capabilities)[number]

export type AuthProfile = {
  perfil?: string | null
  auth_role?: string | null
  ativo?: boolean | null
  acesso_habilitado?: boolean | null
  estado?: string | null
  ufs?: readonly string[] | null
}

const adminCapabilities: readonly Capability[] = capabilities
const gerencialCapabilities: readonly Capability[] = [
  'users.read',
  'users.managePromoters',
  'stores.read',
  'stores.routePromoters',
  'invoices.read',
  'invoices.markUnknown',
  'fstd.create',
  'fstd.editFinalized',
]
const promotorCapabilities: readonly Capability[] = [
  'stores.read',
  'invoices.read',
  'fstd.create',
]

function normalizedUfs(profile: AuthProfile): string[] {
  return [...new Set((profile.ufs ?? []).map((uf) => uf.trim().toUpperCase()).filter(Boolean))]
}

/**
 * Returns frontend capabilities only. Database authorization must still be
 * enforced by RLS, grants, RPCs and server-side validation.
 */
export function getCapabilities(profile: AuthProfile | null | undefined): readonly Capability[] {
  if (!profile || profile.ativo !== true || profile.acesso_habilitado !== true) return []

  if (profile.perfil === 'Admin' && profile.auth_role === 'admin') return adminCapabilities

  const ufs = normalizedUfs(profile)
  if (profile.perfil === 'Gerencial' && profile.auth_role === 'gerencial' && ufs.length > 0) {
    return gerencialCapabilities
  }
  if (profile.perfil === 'Promotor' && profile.auth_role === 'promotor' && ufs.length === 1) {
    return promotorCapabilities
  }

  return []
}

/** Controls exposure and navigation in the frontend; it does not grant database authorization. */
export function can(profile: AuthProfile | null | undefined, capability: Capability): boolean {
  return getCapabilities(profile).includes(capability)
}
