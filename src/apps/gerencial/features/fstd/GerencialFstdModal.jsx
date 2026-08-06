import { useAuth } from '../../../../domains/auth/AuthProvider.jsx'
import { FstdModalShell } from '../../../../domains/fstd/components/FstdModalShell.jsx'
import { PromotorFstdFlow } from '../../../../domains/fstd/components/PromotorFstdFlow.jsx'

export function GerencialFstdModal({ note, store, allowFinalizedEdit = false, onClose, onCompleted }) {
  const { profile } = useAuth()
  if (!profile || !note || !store) return null
  return <FstdModalShell onClose={onClose}><PromotorFstdFlow profile={profile} embeddedFstd allowFinalizedEdit={allowFinalizedEdit} initialStore={store} initialFstdTarget={note} onEmbeddedClose={onClose} onEmbeddedComplete={onCompleted} onLogout={onClose} /></FstdModalShell>
}
