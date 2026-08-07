import { describe, expect, it } from 'vitest'
import { getPasswordValidationMessage } from './passwordPolicy'

describe('passwordPolicy', () => {
  it('aceita a senha padrão de promotor sem símbolo especial', () => {
    expect(getPasswordValidationMessage('Promotor12345')).toBe('')
  })

  it('continua aceitando senhas que possuem símbolo especial', () => {
    expect(getPasswordValidationMessage('Promotor12345!')).toBe('')
  })

  it.each([
    ['curta', 'Pro123'],
    ['sem letra maiúscula', 'promotor12345'],
    ['sem letra minúscula', 'PROMOTOR12345'],
    ['sem número', 'PromotorSenha'],
  ])('rejeita senha %s', (_, password) => {
    expect(getPasswordValidationMessage(password)).not.toBe('')
  })

  it('permite senha vazia apenas quando o campo é opcional', () => {
    expect(getPasswordValidationMessage('', { optional: true })).toBe('')
    expect(getPasswordValidationMessage('')).not.toBe('')
  })
})
