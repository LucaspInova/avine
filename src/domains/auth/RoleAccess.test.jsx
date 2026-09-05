import { describe, expect, it } from 'vitest'
import { getSignInErrorMessage } from './roleAccessUtils.js'

describe('getSignInErrorMessage', () => {
  it('mantém a mensagem genérica para credenciais inválidas', () => {
    expect(getSignInErrorMessage({ code: 'invalid_credentials', status: 400 }))
      .toBe('E-mail ou senha inválidos.')
  })

  it('informa falhas de conexão sem expor detalhes internos', () => {
    expect(getSignInErrorMessage({ message: 'Failed to fetch' }))
      .toBe('Não foi possível conectar ao serviço de autenticação. Tente novamente.')
  })
})
