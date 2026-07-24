import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AvineLogin from './AvineLogin.jsx'

function renderLogin(onSubmit = vi.fn()) {
  render(
    <MemoryRouter>
      <AvineLogin onSubmit={onSubmit} />
    </MemoryRouter>,
  )
  return onSubmit
}

describe('AvineLogin', () => {
  it('expõe erros acessíveis quando o formulário está vazio', () => {
    renderLogin()

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument()
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument()
  })

  it('normaliza o e-mail e envia a preferência de sessão', () => {
    const onSubmit = renderLogin()

    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: '  Pessoa@Exemplo.COM  ' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'SenhaSegura#123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'pessoa@exemplo.com',
      password: 'SenhaSegura#123',
      keepSession: true,
    })
  })
})
