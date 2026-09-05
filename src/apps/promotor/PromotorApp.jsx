import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PromotorWorkspace } from '../../domains/fstd/components/PromotorWorkspace.jsx'
import {
  getPromotorPathFromState,
  getPromotorRoutePath,
  readPromotorNavigation,
  readPromotorRoute,
  savePromotorNavigation,
} from './navigationState'
import { PromotorApplicationShell } from './features/shell/PromotorApplicationShell.jsx'

export { StoreDetailScreen, StoresScreen } from '../../domains/fstd/components/PromotorWorkspace.jsx'

export function PromotorWorkspaceAdapter({ profile, onLogout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const route = useMemo(
    () => readPromotorRoute(location.pathname) ?? { view: 'stores' },
    [location.pathname],
  )
  const canonicalPath = getPromotorRoutePath(route)

  useEffect(() => {
    if (location.pathname !== canonicalPath) navigate(canonicalPath, { replace: true })
  }, [canonicalPath, location.pathname, navigate])

  const navigation = useMemo(() => ({
    read(profileId) {
      return {
        ...(readPromotorNavigation(profileId) ?? {}),
        route,
      }
    },
    save(profileId, value) {
      savePromotorNavigation(profileId, value)
      const nextPath = getPromotorPathFromState(value)
      if (nextPath !== location.pathname) navigate(nextPath)
    },
    openInvoice: () => window.open('https://meudanfe.com.br/', '_blank', 'noopener,noreferrer'),
  }), [location.pathname, navigate, route])

  return (
    <PromotorWorkspace
      key={canonicalPath}
      navigation={navigation}
      onLogout={onLogout}
      profile={profile}
    />
  )
}

function PromotorApp() {
  return (
    <PromotorApplicationShell>
      {({ profile, onLogout }) => (
        <PromotorWorkspaceAdapter profile={profile} onLogout={onLogout} />
      )}
    </PromotorApplicationShell>
  )
}

export default PromotorApp
