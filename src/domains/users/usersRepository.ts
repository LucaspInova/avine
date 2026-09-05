import { supabase } from '../../shared/lib/supabaseClient'
import type { Estado, PerfilUsuario } from '../../types/database.types'
import type { TableRow } from '../../types/database.helpers'

export type ManagedUserRecord = TableRow<'usuarios'>
export type ManagedUserViewModel = ManagedUserRecord & {
  auth_role: 'admin' | 'gerencial' | 'promotor' | null
}

export type CreateGerencialUserPayload = {
  nome: string
  email: string
  password: string
  auth_role?: 'admin' | 'gerencial'
}

export type CreateOperationalUserPayload = {
  nome: string
  email: string
  password: string
  perfil: PerfilUsuario
  estado: Estado
  ufs: Estado[]
}

export type UpdateManagedUserPayload = {
  usuario_id: string
  nome: string
  email: string
  perfil: PerfilUsuario
  estado: Estado
  ufs: Estado[]
  password?: string
  auth_role?: 'admin' | 'gerencial' | 'promotor'
}

type ManageUsersResponse = {
  error?: string
  usuario?: ManagedUserViewModel
  usuarios?: ManagedUserViewModel[]
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

export async function listManagedUsers(): Promise<ManagedUserViewModel[]> {
  const data = await invokeManageUsers({ action: 'list' })
  return data.usuarios ?? []
}

export async function createGerencialUser(payload: CreateGerencialUserPayload): Promise<void> {
  await invokeManageUsers({
    action: 'create',
    ...payload,
    perfil: 'Admin',
    estado: 'CE',
  })
}

export async function createOperationalUser(payload: CreateOperationalUserPayload): Promise<void> {
  return createUser(payload)
}

export async function updateManagedUser(
  payload: UpdateManagedUserPayload,
): Promise<ManagedUserViewModel> {
  const data = await invokeManageUsers({ action: 'update', ...payload })
  if (!data.usuario) throw new Error('A função não retornou o usuário atualizado.')
  return data.usuario
}

export async function deleteManagedUser(usuarioId: string): Promise<void> {
  await invokeManageUsers({ action: 'delete', usuario_id: usuarioId })
}

export async function setManagedUserAccess(
  usuarioId: string,
  enabled: boolean,
): Promise<ManagedUserViewModel> {
  const data = await invokeManageUsers({
    action: 'set_access',
    usuario_id: usuarioId,
    enabled,
  })
  if (!data.usuario) throw new Error('A função não retornou o usuário atualizado.')
  return data.usuario
}
