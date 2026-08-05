import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ForgotPasswordScreen } from './PasswordRecovery.jsx'

const { resetPasswordForEmail } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail,
    },
  },
}))

describe('PasswordRecovery', () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset()
    window.history.replaceState({}, '', '/esqueci-senha')
  })

  it('usa o Site URL do Supabase quando a origem atual ainda não está no allowlist', async () => {
    resetPasswordForEmail
      .mockResolvedValueOnce({ error: { message: 'Invalid redirect URL' } })
      .mockResolvedValueOnce({ error: null })

    render(
      <MemoryRouter initialEntries={['/esqueci-senha']}>
        <ForgotPasswordScreen />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'Pessoa@Exemplo.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de recuperação' }))

    await waitFor(() => expect(screen.getByText('Confira seu e-mail')).toBeInTheDocument())

    expect(resetPasswordForEmail).toHaveBeenNthCalledWith(
      1,
      'pessoa@exemplo.com',
      { redirectTo: `${window.location.origin}/redefinir-senha` },
    )
    expect(resetPasswordForEmail).toHaveBeenNthCalledWith(2, 'pessoa@exemplo.com')
  })

  it('não repete a solicitação para erros de envio', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'Error sending recovery email' } })

    render(
      <MemoryRouter initialEntries={['/esqueci-senha']}>
        <ForgotPasswordScreen />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'pessoa@exemplo.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de recuperação' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1)
  })

  it('explica quando o provedor atingiu o limite de envio', async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { status: 429, code: 'over_email_send_rate_limit' },
    })

    render(
      <MemoryRouter initialEntries={['/esqueci-senha']}>
        <ForgotPasswordScreen />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'pessoa@exemplo.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Enviar link de recupera/ }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('limite de envio'))
  })
})
