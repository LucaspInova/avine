import { ConfirmDialog } from '../ui'

export default function LogoutConfirmDialog({ isOpen, isLoading = false, onCancel, onConfirm }) {
  return (
    <ConfirmDialog
      cancelLabel="Cancelar"
      confirmLabel={isLoading ? 'Saindo...' : 'Sair'}
      description="Você precisará entrar novamente para acessar o aplicativo."
      isLoading={isLoading}
      isOpen={isOpen}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title="Sair da conta?"
    />
  )
}
