/// <reference types="vite/client" />

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database.types'

const projectIdOrUrl =
  import.meta.env.VITE_SUPABASE_URL?.trim() ||
  import.meta.env.VITE_SUPABASE_PROJECT_ID?.trim()

export function resolveSupabaseUrl(projectIdOrUrl?: string) {
  const value = projectIdOrUrl?.trim()
  if (!value) return ''

  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}.supabase.co`,
    )

    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co')
      ? url.origin
      : ''
  } catch {
    return ''
  }
}

// Aceita o ID do projeto (formato documentado) e a URL do projeto, formato
// comum ao copiar a credencial diretamente do painel do Supabase.
const supabaseUrl = resolveSupabaseUrl(projectIdOrUrl)
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const supabaseConfigError =
  !supabaseUrl || !supabaseKey
    ? 'Configure VITE_SUPABASE_URL (ou VITE_SUPABASE_PROJECT_ID) e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente.'
    : null

const AUTH_PERSISTENCE_KEY = 'avine-auth-persistence'
const authStorageKey = supabaseUrl
  ? `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
  : 'avine-auth-token'

function getBrowserStorage(kind: 'local' | 'session'): Storage | null {
  if (typeof window === 'undefined') return null
  return kind === 'local' ? window.localStorage : window.sessionStorage
}

function getPersistenceMode(): 'local' | 'session' {
  try {
    return getBrowserStorage('local')?.getItem(AUTH_PERSISTENCE_KEY) === 'session'
      ? 'session'
      : 'local'
  } catch {
    return 'local'
  }
}

const authStorage = {
  getItem(key: string) {
    try {
      return getBrowserStorage(getPersistenceMode())?.getItem(key) ?? null
    } catch {
      return null
    }
  },
  setItem(key: string, value: string) {
    try {
      getBrowserStorage(getPersistenceMode())?.setItem(key, value)
    } catch {
      // A sessão em memória continua disponível mesmo sem storage persistente.
    }
  },
  removeItem(key: string) {
    try {
      getBrowserStorage('local')?.removeItem(key)
      getBrowserStorage('session')?.removeItem(key)
    } catch {
      // Ignora falhas de armazenamento durante logout.
    }
  },
}

export function setAuthPersistence(keepSession: boolean) {
  const mode = keepSession ? 'local' : 'session'

  try {
    getBrowserStorage('local')?.setItem(AUTH_PERSISTENCE_KEY, mode)
    getBrowserStorage(mode === 'local' ? 'session' : 'local')?.removeItem(authStorageKey)
  } catch {
    // O cliente ainda pode manter a sessão em memória nesta execução.
  }
}

export const supabase = createClient<Database>(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseKey || 'sb_publishable_missing_configuration',
  {
    auth: {
      persistSession: true,
      storage: authStorage,
    },
  },
)
