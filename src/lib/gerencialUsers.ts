import { supabase } from './supabaseClient'

export type CreateGerencialUserPayload = {
  nome: string
  email: string
  password: string
}

export type CreateOperationalUserPayload = {
  nome: string
  email: string
  password: string
  perfil: 'Promotor' | 'Entregador'
  estado: string
  fotos_habilitadas: boolean
}

type CreateGerencialUserResponse = {
  error?: string
}

function getFunctionResponse(error: unknown): Response | null {
  if (!error || typeof error !== 'object' || !('context' in error)) return null

  const context = (error as { context?: unknown }).context
  return context instanceof Response ? context : null
}

async function createUser(payload: CreateGerencialUserPayload | CreateOperationalUserPayload): Promise<void> {
  const { data, error } = await supabase.functions.invoke<CreateGerencialUserResponse>(
    'create-gerencial-user',
    { body: payload },
  )

  if (error) {
    const response = getFunctionResponse(error)

    if (response) {
      const body = (await response.json().catch(() => null)) as CreateGerencialUserResponse | null
      if (body?.error) throw new Error(body.error)
    }

    throw error
  }

  if (data?.error) throw new Error(data.error)
}

export async function createGerencialUser(payload: CreateGerencialUserPayload): Promise<void> {
  return createUser(payload)
}

export async function createOperationalUser(payload: CreateOperationalUserPayload): Promise<void> {
  return createUser(payload)
}
