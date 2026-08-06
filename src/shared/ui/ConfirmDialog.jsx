import { Button } from './Button.jsx'
import { Modal } from './Modal.jsx'

export function ConfirmDialog({ cancelLabel = 'Cancelar', confirmLabel = 'Confirmar', description, isLoading = false, isOpen, onCancel, onConfirm, title, tone = 'danger' }) {
  return (
    <Modal
      className="ui-confirm-dialog"
      isOpen={isOpen}
      onClose={isLoading ? undefined : onCancel}
      title={title}
      footer={(
        <>
          <Button variant="secondary" disabled={isLoading} onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={tone} disabled={isLoading} onClick={onConfirm}>{isLoading ? 'Aguarde...' : confirmLabel}</Button>
        </>
      )}
    >
      <p>{description}</p>
    </Modal>
  )
}
