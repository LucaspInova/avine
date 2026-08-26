import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog.jsx'

describe('ConfirmDialog', () => {
  it('identifica a camada do diálogo para permitir o posicionamento central no mobile', () => {
    render(
      <ConfirmDialog
        description="Você precisará entrar novamente para acessar o aplicativo."
        isOpen
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Sair da conta?"
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Sair da conta?' })
    expect(dialog.parentElement).toHaveClass('ui-modal-layer', 'ui-confirm-dialog-layer')
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeVisible()
  })
})
