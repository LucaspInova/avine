import './LogoutConfirmDialog.css'

export default function LogoutConfirmDialog({ isOpen, isLoading = false, onCancel, onConfirm }) {
  if (!isOpen) return null

  return (
    <div className="logout-confirm-layer" role="presentation">
      <button
        className="logout-confirm-backdrop"
        type="button"
        aria-label="Fechar confirmação de saída"
        onClick={onCancel}
      />
      <section className="logout-confirm-card" role="dialog" aria-modal="true" aria-labelledby="logout-confirm-title">
        <h2 id="logout-confirm-title">Sair da conta?</h2>
        <p>Você precisará entrar novamente para acessar o aplicativo.</p>
        <div className="logout-confirm-actions">
          <button
            className="logout-cancel-button"
            type="button"
            disabled={isLoading}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            className="logout-confirm-button"
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
          >
            {isLoading ? 'Saindo...' : 'Sair'}
          </button>
        </div>
      </section>
    </div>
  )
}
