export type AppErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'NETWORK'
  | 'UNKNOWN'

const messages: Record<AppErrorCode, string> = {
  AUTH_REQUIRED: 'Sua sessão expirou. Entre novamente.',
  FORBIDDEN: 'Você não tem permissão para realizar esta ação.',
  NOT_FOUND: 'O registro solicitado não foi encontrado.',
  CONFLICT: 'Este registro já existe ou está sendo utilizado.',
  VALIDATION: 'Revise os dados informados e tente novamente.',
  NETWORK: 'Não foi possível conectar ao servidor. Tente novamente.',
  UNKNOWN: 'Não foi possível concluir a operação. Tente novamente.',
}

export class AppError extends Error {
  constructor(public readonly code: AppErrorCode, message = messages[code], public readonly cause?: unknown) {
    super(message)
    this.name = 'AppError'
  }
}

type TechnicalError = { code?: string; message?: string; status?: number }

export function toAppError(error: unknown, fallback?: string): AppError {
  if (error instanceof AppError) return error
  const technical = (error && typeof error === 'object' ? error : {}) as TechnicalError
  const message = String(technical.message ?? error ?? '').toLowerCase()
  let code: AppErrorCode = 'UNKNOWN'

  if (technical.status === 401 || message.includes('jwt') || message.includes('not authenticated')) code = 'AUTH_REQUIRED'
  else if (technical.status === 403 || technical.code === '42501' || message.includes('permission denied')) code = 'FORBIDDEN'
  else if (technical.status === 404 || technical.code === 'PGRST116') code = 'NOT_FOUND'
  else if (technical.code === '23505' || technical.code === '23503') code = 'CONFLICT'
  else if (technical.code === '22P02' || technical.code === '23502') code = 'VALIDATION'
  else if (message.includes('fetch') || message.includes('network')) code = 'NETWORK'

  return new AppError(code, fallback ?? messages[code], error)
}
