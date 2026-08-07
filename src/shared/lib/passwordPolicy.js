export const PASSWORD_MIN_LENGTH = 8

export function getPasswordValidationMessage(password, { optional = false } = {}) {
  if (!password) return optional ? '' : `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`
  }
  if (!/[a-z]/.test(password)) return 'A senha deve conter pelo menos uma letra minúscula.'
  if (!/[A-Z]/.test(password)) return 'A senha deve conter pelo menos uma letra maiúscula.'
  if (!/[0-9]/.test(password)) return 'A senha deve conter pelo menos um número.'
  return ''
}
