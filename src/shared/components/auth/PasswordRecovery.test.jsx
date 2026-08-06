import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ForgotPasswordScreen, ResetPasswordScreen } from './PasswordRecovery.jsx'

const {
  getSession,
  onAuthStateChange,
  resetPasswordForEmail,
  signOut,
  updateUser,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock('../../lib/supabaseClient.ts', () => ({
  supabase: {
    auth: {
      getSession,
      onAuthStateChange,
      resetPasswordForEmail,
      signOut,
      updateUser,
    },
  },
}))

describe('PasswordRecovery', () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset()
    getSession.mockReset()
    onAuthStateChange.mockReset()
    signOut.mockReset()
    updateUser.mockReset()
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    window.history.replaceState({}, '', '/esqueci-senha')
  })

  it('envia o link usando a origem atual da aplicacao', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null })

    render(
      <MemoryRouter initialEntries={['/esqueci-senha']}>
        <ForgotPasswordScreen />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'Pessoa@Exemplo.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Enviar link de recupera/ }))

    await waitFor(() => expect(screen.getByText('Confira seu e-mail')).toBeInTheDocument())

    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'pessoa@exemplo.com',
      { redirectTo: `${window.location.origin}/redefinir-senha` },
    )
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1)
  })

  it('nao repete a solicitacao para erros de envio', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'Error sending recovery email' } })

    render(
      <MemoryRouter initialEntries={['/esqueci-senha']}>
        <ForgotPasswordScreen />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'pessoa@exemplo.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Enviar link de recupera/ }))

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

  it('aguarda a sessao de recuperacao antes de exibir o formulario', async () => {
    window.history.replaceState({}, '', '/redefinir-senha#access_token=token&type=recovery')
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null })

    render(
      <MemoryRouter initialEntries={['/redefinir-senha']}>
        <ResetPasswordScreen />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByLabelText('Nova senha')).toBeInTheDocument())
    expect(screen.getByLabelText('Confirmar nova senha')).toBeInTheDocument()
  })

  it('recusa acesso direto sem sessao de recuperacao', async () => {
    render(
      <MemoryRouter initialEntries={['/redefinir-senha']}>
        <ResetPasswordScreen />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText(/Link indispon/)).toBeInTheDocument())
  })

  it('trata otp_expired na query e limpa os parametros sensiveis da URL', async () => {
    window.history.replaceState(
      {},
      '',
      '/redefinir-senha?error=access_denied&error_code=otp_expired&error_description=Email%20link%20is%20invalid%20or%20has%20expired',
    )

    render(
      <MemoryRouter initialEntries={['/redefinir-senha']}>
        <ResetPasswordScreen />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Este link de redefini/)).toBeInTheDocument()
    await waitFor(() => {
      expect(window.location.pathname).toBe('/redefinir-senha')
      expect(window.location.search).toBe('')
      expect(window.location.hash).toBe('')
    })
  })

  it('valida confirmacao e atualiza a senha com a sessao de recuperacao', async () => {
    window.history.replaceState({}, '', '/redefinir-senha#access_token=token&type=recovery')
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null })
    updateUser.mockResolvedValue({ error: null })
    signOut.mockResolvedValue({ error: null })

    render(
      <MemoryRouter initialEntries={['/redefinir-senha']}>
        <ResetPasswordScreen />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByLabelText('Nova senha')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'NovaSenha1!' } })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'OutraSenha1!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar senha' }))

    expect(await screen.findByText(/As senhas/)).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText('Digite a senha novamente'), { target: { value: 'NovaSenha1!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar senha' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'NovaSenha1!' }))
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(await screen.findByText('Senha atualizada')).toBeInTheDocument()
  })
})
