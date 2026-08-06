/* eslint-disable react-refresh/only-export-components */
import { useMemo } from 'react'
import { useAuth } from '../../domains/auth/AuthProvider.jsx'
import GerencialApp from './GerencialApp.jsx'

export function deriveGerencialCapabilities(profile) {
  const isAdmin = profile?.perfil === 'Admin' && profile?.auth_role === 'admin'
  const isGerencial = profile?.perfil === 'Gerencial' && profile?.auth_role === 'gerencial'
  const allowedUfs = isGerencial ? [...new Set(profile?.ufs ?? [])] : []

  return {
    isAdmin,
    isGerencial,
    isScoped: isGerencial,
    allowedUfs,
    canManageAllUsers: isAdmin,
    canManageStores: isAdmin,
  }
}

export default function GerencialRoutes() {
  const { profile } = useAuth()
  const capabilities = useMemo(() => deriveGerencialCapabilities(profile), [profile])

  return <GerencialApp capabilities={capabilities} />
}
