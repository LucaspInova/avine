export function getSignInErrorMessage(signInError) {
  if (signInError?.code === 'invalid_credentials' || signInError?.status === 400) {
    return 'E-mail ou senha inválidos.'
  }

  return 'Não foi possível conectar ao serviço de autenticação. Tente novamente.'
}
