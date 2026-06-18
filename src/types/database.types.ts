export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Estado =
  | 'CE'
  | 'MA'
  | 'BA'
  | 'PA'
  | 'PB'
  | 'PI'
  | 'PE'
  | 'AP'
  | 'SE'
  | 'RN'
  | 'AL'

export type PerfilUsuario = 'Promotor' | 'Entregador' | 'Gerencial'
export type ProdutoFstd = 'GAL' | 'COD' | 'SIU'
export type StatusFstd = 'solicitada' | 'validada' | 'cancelada' | 'recolhida'
export type OrigemFstd = 'mobile' | 'gerencial' | 'importacao'
export type StatusRecolhimento = 'solicitado' | 'roteirizado' | 'recolhido' | 'cancelado'
export type StatusNfd = 'atrasada' | 'finalizada' | 'avulsa' | 'outros'

export type Database = {
  public: {
    Tables: {
      usuarios: {
        Row: {
          id: string
          email: string
          nome: string
          perfil: PerfilUsuario
          estado: Estado
          fotos_habilitadas: boolean
          created_at: string
          auth_user_id: string | null
          ativo: boolean
          foto_url: string | null
        }
        Insert: {
          id?: string
          email: string
          nome: string
          perfil: PerfilUsuario
          estado: Estado
          fotos_habilitadas?: boolean
          created_at?: string
          auth_user_id?: string | null
          ativo?: boolean
          foto_url?: string | null
        }
        Update: {
          id?: string
          email?: string
          nome?: string
          perfil?: PerfilUsuario
          estado?: Estado
          fotos_habilitadas?: boolean
          created_at?: string
          auth_user_id?: string | null
          ativo?: boolean
          foto_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'usuarios_auth_user_id_fkey'
            columns: ['auth_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      lojas: {
        Row: {
          id: string
          codigo: string
          nome: string
          uf: Estado
          cidade: string
          created_at: string | null
        }
        Insert: {
          id?: string
          codigo: string
          nome: string
          uf: Estado
          cidade: string
          created_at?: string | null
        }
        Update: {
          id?: string
          codigo?: string
          nome?: string
          uf?: Estado
          cidade?: string
          created_at?: string | null
        }
        Relationships: []
      }
      loja_promotores: {
        Row: {
          id: string
          loja_id: string | null
          promotor_id: string | null
          posicao: 1 | 2 | 3
          created_at: string | null
        }
        Insert: {
          id?: string
          loja_id?: string | null
          promotor_id?: string | null
          posicao: 1 | 2 | 3
          created_at?: string | null
        }
        Update: {
          id?: string
          loja_id?: string | null
          promotor_id?: string | null
          posicao?: 1 | 2 | 3
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'loja_promotores_loja_id_fkey'
            columns: ['loja_id']
            isOneToOne: false
            referencedRelation: 'lojas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loja_promotores_promotor_id_fkey'
            columns: ['promotor_id']
            isOneToOne: false
            referencedRelation: 'usuarios'
            referencedColumns: ['id']
          },
        ]
      }
      motivos_devolucao: {
        Row: {
          id: string
          nome: string
          ativo: boolean
          ordem: number
          created_at: string
        }
        Insert: {
          id?: string
          nome: string
          ativo?: boolean
          ordem?: number
          created_at?: string
        }
        Update: {
          id?: string
          nome?: string
          ativo?: boolean
          ordem?: number
          created_at?: string
        }
        Relationships: []
      }
      nfds: {
        Row: {
          id: string
          loja_id: string
          numero: string
          data_emissao: string
          data_envio: string | null
          valor_total: number
          quantidade_total: number
          tipo_devolucao: string
          forma_envio: string
          origem: string
          observacao: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          loja_id: string
          numero: string
          data_emissao: string
          data_envio?: string | null
          valor_total?: number
          quantidade_total?: number
          tipo_devolucao?: string
          forma_envio?: string
          origem?: string
          observacao?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          loja_id?: string
          numero?: string
          data_emissao?: string
          data_envio?: string | null
          valor_total?: number
          quantidade_total?: number
          tipo_devolucao?: string
          forma_envio?: string
          origem?: string
          observacao?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'nfds_loja_id_fkey'
            columns: ['loja_id']
            isOneToOne: false
            referencedRelation: 'lojas'
            referencedColumns: ['id']
          },
        ]
      }
      fstds: {
        Row: {
          id: string
          nfd_id: string | null
          loja_id: string
          promotor_id: string
          motivo_id: string
          status: StatusFstd
          origem: OrigemFstd
          observacao: string | null
          solicitada_em: string
          validada_em: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nfd_id?: string | null
          loja_id: string
          promotor_id: string
          motivo_id: string
          status?: StatusFstd
          origem?: OrigemFstd
          observacao?: string | null
          solicitada_em?: string
          validada_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nfd_id?: string | null
          loja_id?: string
          promotor_id?: string
          motivo_id?: string
          status?: StatusFstd
          origem?: OrigemFstd
          observacao?: string | null
          solicitada_em?: string
          validada_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fstds_nfd_id_fkey'
            columns: ['nfd_id']
            isOneToOne: false
            referencedRelation: 'nfds'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fstds_loja_id_fkey'
            columns: ['loja_id']
            isOneToOne: false
            referencedRelation: 'lojas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fstds_promotor_id_fkey'
            columns: ['promotor_id']
            isOneToOne: false
            referencedRelation: 'usuarios'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fstds_motivo_id_fkey'
            columns: ['motivo_id']
            isOneToOne: false
            referencedRelation: 'motivos_devolucao'
            referencedColumns: ['id']
          },
        ]
      }
      fstd_itens: {
        Row: {
          id: string
          fstd_id: string
          produto: ProdutoFstd
          quantidade: number
          created_at: string
        }
        Insert: {
          id?: string
          fstd_id: string
          produto: ProdutoFstd
          quantidade: number
          created_at?: string
        }
        Update: {
          id?: string
          fstd_id?: string
          produto?: ProdutoFstd
          quantidade?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fstd_itens_fstd_id_fkey'
            columns: ['fstd_id']
            isOneToOne: false
            referencedRelation: 'fstds'
            referencedColumns: ['id']
          },
        ]
      }
      fstd_fotos: {
        Row: {
          id: string
          fstd_id: string
          promotor_id: string
          storage_path: string
          legenda: string | null
          created_at: string
        }
        Insert: {
          id?: string
          fstd_id: string
          promotor_id: string
          storage_path: string
          legenda?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          fstd_id?: string
          promotor_id?: string
          storage_path?: string
          legenda?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fstd_fotos_fstd_id_fkey'
            columns: ['fstd_id']
            isOneToOne: false
            referencedRelation: 'fstds'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fstd_fotos_promotor_id_fkey'
            columns: ['promotor_id']
            isOneToOne: false
            referencedRelation: 'usuarios'
            referencedColumns: ['id']
          },
        ]
      }
      recolhimentos: {
        Row: {
          id: string
          fstd_id: string
          loja_id: string
          status: StatusRecolhimento
          data_solicitacao: string
          data_prevista: string | null
          data_recolhimento: string | null
          responsavel_id: string | null
          observacao: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          fstd_id: string
          loja_id: string
          status?: StatusRecolhimento
          data_solicitacao?: string
          data_prevista?: string | null
          data_recolhimento?: string | null
          responsavel_id?: string | null
          observacao?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          fstd_id?: string
          loja_id?: string
          status?: StatusRecolhimento
          data_solicitacao?: string
          data_prevista?: string | null
          data_recolhimento?: string | null
          responsavel_id?: string | null
          observacao?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recolhimentos_fstd_id_fkey'
            columns: ['fstd_id']
            isOneToOne: false
            referencedRelation: 'fstds'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recolhimentos_loja_id_fkey'
            columns: ['loja_id']
            isOneToOne: false
            referencedRelation: 'lojas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recolhimentos_responsavel_id_fkey'
            columns: ['responsavel_id']
            isOneToOne: false
            referencedRelation: 'usuarios'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      lojas_com_promotores: {
        Row: {
          loja_id: string | null
          codigo: string | null
          loja_nome: string | null
          uf: Estado | null
          cidade: string | null
          promotor_1: string | null
          promotor_2: string | null
          promotor_3: string | null
        }
        Relationships: []
      }
      nfds_com_status: {
        Row: {
          id: string | null
          loja_id: string | null
          loja_codigo: string | null
          loja_nome: string | null
          uf: Estado | null
          cidade: string | null
          numero: string | null
          data_emissao: string | null
          data_envio: string | null
          valor_total: number | null
          quantidade_total: number | null
          tipo_devolucao: string | null
          forma_envio: string | null
          origem: string | null
          fstd_id: string | null
          fstd_status: StatusFstd | null
          status_nfd: StatusNfd | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_gerencial_user: {
        Args: {
          p_auth_user_id: string
          p_nome: string
          p_email: string
        }
        Returns: Database['public']['Tables']['usuarios']['Row']
      }
      is_current_user_gerencial_ativo: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      update_gerencial_user: {
        Args: {
          p_usuario_id: string
          p_nome: string
          p_email: string
          p_ativo: boolean
        }
        Returns: Database['public']['Tables']['usuarios']['Row']
      }
      solicitar_fstd: {
        Args: {
          p_loja_id: string
          p_motivo_id: string
          p_nfd_id?: string | null
          p_quantidade_gal?: number
          p_quantidade_cod?: number
          p_quantidade_siu?: number
          p_fotos?: string[]
          p_observacao?: string | null
        }
        Returns: Database['public']['Tables']['fstds']['Row']
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

export type Usuario = Database['public']['Tables']['usuarios']['Row']
export type UsuarioInsert = Database['public']['Tables']['usuarios']['Insert']
export type UsuarioUpdate = Database['public']['Tables']['usuarios']['Update']

export type Loja = Database['public']['Tables']['lojas']['Row']
export type LojaInsert = Database['public']['Tables']['lojas']['Insert']
export type LojaUpdate = Database['public']['Tables']['lojas']['Update']

export type LojaPromotor = Database['public']['Tables']['loja_promotores']['Row']
export type LojaPromotorInsert = Database['public']['Tables']['loja_promotores']['Insert']
export type LojaPromotorUpdate = Database['public']['Tables']['loja_promotores']['Update']

export type LojaComPromotores = Database['public']['Views']['lojas_com_promotores']['Row']

export type MotivoDevolucao = Database['public']['Tables']['motivos_devolucao']['Row']
export type Nfd = Database['public']['Tables']['nfds']['Row']
export type Fstd = Database['public']['Tables']['fstds']['Row']
export type FstdItem = Database['public']['Tables']['fstd_itens']['Row']
export type FstdFoto = Database['public']['Tables']['fstd_fotos']['Row']
export type Recolhimento = Database['public']['Tables']['recolhimentos']['Row']
export type NfdComStatus = Database['public']['Views']['nfds_com_status']['Row']
