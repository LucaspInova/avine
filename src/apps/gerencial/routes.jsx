/* eslint-disable react-refresh/only-export-components */
import { useMemo } from 'react'
import { useAuth } from '../../domains/auth/AuthProvider.jsx'
import GerencialApp from './GerencialApp.jsx'
import { can } from '../../domains/auth/model/capabilities'

export function deriveGerencialCapabilities(profile) {
  const isAdmin = can(profile, 'admin.runRestrictedOperations')
  const isGerencial = can(profile, 'users.managePromoters') && !isAdmin
  const allowedUfs = isGerencial
    ? [...new Set((profile?.ufs ?? []).map((uf) => String(uf).trim().toUpperCase()).filter(Boolean))]
    : []

  return {
    isAdmin,
    isGerencial,
    isScoped: isGerencial,
    allowedUfs,
    canManageAllUsers: can(profile, 'users.manageGerencial'),
    canManageStores: can(profile, 'stores.create'),
  }
}

export default function GerencialRoutes() {
  const { profile } = useAuth()
  const capabilities = useMemo(() => deriveGerencialCapabilities(profile), [profile])

  return <GerencialApp capabilities={capabilities} />
}
