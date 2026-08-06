import { PromotorWorkspace } from '../../domains/fstd/components/PromotorWorkspace.jsx'
import { readPromotorNavigation, savePromotorNavigation } from './navigationState'
import { PromotorApplicationShell } from './features/shell/PromotorApplicationShell.jsx'

export { StoreDetailScreen, StoresScreen } from '../../domains/fstd/components/PromotorWorkspace.jsx'

const promotorNavigation = {
  read: readPromotorNavigation,
  save: savePromotorNavigation,
  openInvoice: () => window.open('https://meudanfe.com.br/', '_blank', 'noopener,noreferrer'),
}

export function PromotorWorkspaceAdapter({ profile, onLogout }) {
  return (
    <PromotorWorkspace
      navigation={promotorNavigation}
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
