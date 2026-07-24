import { supabase } from './supabaseClient'

export type ManagedUser = {
  id: string
  auth_user_id: string | null
  email: string
  nome: string
  perfil: 'Promotor' | 'Entregador' | 'Gerencial'
  estado: string
  fotos_habilitadas: boolean
  ativo: boolean
  acesso_habilitado: boolean
  foto_url: string | null
  created_at: string
}

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

export type UpdateManagedUserPayload = {
  usuario_id: string
  nome: string
  email: string
  perfil: 'Promotor' | 'Entregador' | 'Gerencial'
  estado: string
  fotos_habilitadas: boolean
  ativo: boolean
  acesso_habilitado: boolean
  password?: string
}

type ManageUsersResponse = {
  error?: string
  usuario?: ManagedUser
  usuarios?: ManagedUser[]
}

function getFunctionResponse(error: unknown): Response | null {
  if (!error || typeof error !== 'object' || !('context' in error)) return null

  const context = (error as { context?: unknown }).context
  return context instanceof Response ? context : null
}

async function invokeManageUsers(body: Record<string, unknown>): Promise<ManageUsersResponse> {
  if (!supabase) throw new Error('Supabase não configurado.')

  const { data, error } = await supabase.functions.invoke<ManageUsersResponse>(
    'manage-users',
    { body },
  )

  if (error) {
    const response = getFunctionResponse(error)

    if (response) {
      const responseBody = (await response.json().catch(() => null)) as ManageUsersResponse | null
      if (responseBody?.error) throw new Error(responseBody.error)
    }

    throw error
  }

  if (data?.error) throw new Error(data.error)
  return data ?? {}
}

async function createUser(
  payload: CreateGerencialUserPayload | CreateOperationalUserPayload,
): Promise<void> {
  await invokeManageUsers({ action: 'create', ...payload })
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const data = await invokeManageUsers({ action: 'list' })
  return data.usuarios ?? []
}

export async function createGerencialUser(payload: CreateGerencialUserPayload): Promise<void> {
  await invokeManageUsers({
    action: 'create',
    ...payload,
    perfil: 'Gerencial',
    estado: 'CE',
    fotos_habilitadas: false,
  })
}

export async function createOperationalUser(payload: CreateOperationalUserPayload): Promise<void> {
  return createUser(payload)
}

export async function updateManagedUser(
  payload: UpdateManagedUserPayload,
): Promise<ManagedUser> {
  const data = await invokeManageUsers({ action: 'update', ...payload })
  if (!data.usuario) throw new Error('A função não retornou o usuário atualizado.')
  return data.usuario
}

export async function setManagedUserAccess(
  usuarioId: string,
  acessoHabilitado: boolean,
  ativo = acessoHabilitado,
): Promise<ManagedUser> {
  const data = await invokeManageUsers({
    action: 'set_access',
    usuario_id: usuarioId,
    acesso_habilitado: acessoHabilitado,
    ativo,
  })
  if (!data.usuario) throw new Error('A função não retornou o usuário atualizado.')
  return data.usuario
}
