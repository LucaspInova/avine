import { useAuth } from '../../../../domains/auth/AuthProvider.jsx'
import { FstdModalShell } from '../../../../domains/fstd/components/FstdModalShell.jsx'
import { PromotorFstdFlow } from '../../../../domains/fstd/components/PromotorFstdFlow.jsx'

export function GerencialFinalizedNfdModal({ note, store, onClose, onEdit }) {
  const { profile } = useAuth()
  if (!profile || !note || !store) return null
  return <FstdModalShell finalized label="NFD finalizada" onClose={onClose}><PromotorFstdFlow profile={profile} embeddedFinalized initialStore={store} initialFstdTarget={note} onEmbeddedClose={onClose} onEmbeddedEdit={onEdit} onLogout={onClose} /></FstdModalShell>
}
