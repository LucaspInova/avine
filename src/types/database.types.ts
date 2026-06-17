export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'promotor' | 'gerencial'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          nome: string
          email: string
          role: UserRole
          uf: string | null
          fotos: boolean | null
          ativo: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          nome: string
          email: string
          role: UserRole
          uf?: string | null
          fotos?: boolean | null
          ativo?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          nome?: string
          email?: string
          role?: UserRole
          uf?: string | null
          fotos?: boolean | null
          ativo?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      stores: {
        Row: {
          id: string
          codigo: number
          nome: string
          nome_old: string | null
          uf: string | null
          cidade: string | null
          cidade_normalizada: string | null
          icon: string | null
          ativo: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          codigo: number
          nome: string
          nome_old?: string | null
          uf?: string | null
          cidade?: string | null
          cidade_normalizada?: string | null
          icon?: string | null
          ativo?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          codigo?: number
          nome?: string
          nome_old?: string | null
          uf?: string | null
          cidade?: string | null
          cidade_normalizada?: string | null
          icon?: string | null
          ativo?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_stores: {
        Row: {
          id: string
          user_id: string
          store_id: string
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          store_id: string
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          store_id?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'user_stores_store_id_fkey'
            columns: ['store_id']
            isOneToOne: false
            referencedRelation: 'stores'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_stores_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      usuarios: {
        Row: {
          id: string
          auth_user_id: string | null
          email: string
          nome: string
          perfil: 'Promotor' | 'Entregador' | 'Gerencial'
          estado: 'CE' | 'MA' | 'BA' | 'PA' | 'PB' | 'PI' | 'PE' | 'AP' | 'SE' | 'RN' | 'AL'
          fotos_habilitadas: boolean
          ativo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          auth_user_id?: string | null
          email: string
          nome: string
          perfil: 'Promotor' | 'Entregador' | 'Gerencial'
          estado: 'CE' | 'MA' | 'BA' | 'PA' | 'PB' | 'PI' | 'PE' | 'AP' | 'SE' | 'RN' | 'AL'
          fotos_habilitadas?: boolean
          ativo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          auth_user_id?: string | null
          email?: string
          nome?: string
          perfil?: 'Promotor' | 'Entregador' | 'Gerencial'
          estado?: 'CE' | 'MA' | 'BA' | 'PA' | 'PB' | 'PI' | 'PE' | 'AP' | 'SE' | 'RN' | 'AL'
          fotos_habilitadas?: boolean
          ativo?: boolean
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: UserRole | null
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export type Store = Database['public']['Tables']['stores']['Row']
export type StoreInsert = Database['public']['Tables']['stores']['Insert']
export type StoreUpdate = Database['public']['Tables']['stores']['Update']

export type UserStore = Database['public']['Tables']['user_stores']['Row']
export type UserStoreInsert = Database['public']['Tables']['user_stores']['Insert']
export type UserStoreUpdate = Database['public']['Tables']['user_stores']['Update']

export type Usuario = Database['public']['Tables']['usuarios']['Row']
export type UsuarioInsert = Database['public']['Tables']['usuarios']['Insert']
export type UsuarioUpdate = Database['public']['Tables']['usuarios']['Update']
