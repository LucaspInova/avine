import { supabase } from './supabaseClient'

export type CreateGerencialUserPayload = {
  nome: string
  email: string
  password: string
}

type CreateGerencialUserResponse = {
  error?: string
}

function getFunctionResponse(error: unknown): Response | null {
  if (!error || typeof error !== 'object' || !('context' in error)) return null

  const context = (error as { context?: unknown }).context
  return context instanceof Response ? context : null
}

export async function createGerencialUser(payload: CreateGerencialUserPayload): Promise<void> {
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
