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
export type StatusFstd = 'solicitada' | 'validada' | 'cancelada' | 'recolhida'
export type OrigemFstd = 'mobile' | 'gerencial' | 'importacao'

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
          acesso_habilitado: boolean
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
          acesso_habilitado?: boolean
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
          acesso_habilitado?: boolean
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
      nfd_itens: {
        Row: {
          id: number
          estabelecimento: string
          nota_fiscal: number
          chave_acesso: string
          data_emissao: string
          valor: number
          quantidade_galinha: number
          valor_galinha: number
          quantidade_codorna: number
          valor_codorna: number
          codigo_cliente: number
          nome_abreviado: string | null
          uf: string | null
          cidade: string | null
          codigo_produto: string
          descricao_produto: string | null
          data_referencia: string
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id: number
          estabelecimento: string
          nota_fiscal: number
          chave_acesso: string
          data_emissao: string
          valor?: number
          quantidade_galinha?: number
          valor_galinha?: number
          quantidade_codorna?: number
          valor_codorna?: number
          codigo_cliente: number
          nome_abreviado?: string | null
          uf?: string | null
          cidade?: string | null
          codigo_produto: string
          descricao_produto?: string | null
          data_referencia: string
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: number
          estabelecimento?: string
          nota_fiscal?: number
          chave_acesso?: string
          data_emissao?: string
          valor?: number
          quantidade_galinha?: number
          valor_galinha?: number
          quantidade_codorna?: number
          valor_codorna?: number
          codigo_cliente?: number
          nome_abreviado?: string | null
          uf?: string | null
          cidade?: string | null
          codigo_produto?: string
          descricao_produto?: string | null
          data_referencia?: string
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: []
      }
      nfd_logs: {
        Row: {
          id: number
          data_referencia: string
          iniciado_em: string
          finalizado_em: string | null
          status: string
          registros_recebidos: number
          registros_processados: number
          url_consultada: string | null
          mensagem: string | null
          erro: string | null
          registros_invalidos: number
          detalhes_invalidos: Json | null
        }
        Insert: {
          id: number
          data_referencia: string
          iniciado_em?: string
          finalizado_em?: string | null
          status?: string
          registros_recebidos?: number
          registros_processados?: number
          url_consultada?: string | null
          mensagem?: string | null
          erro?: string | null
          registros_invalidos?: number
          detalhes_invalidos?: Json | null
        }
        Update: {
          id?: number
          data_referencia?: string
          iniciado_em?: string
          finalizado_em?: string | null
          status?: string
          registros_recebidos?: number
          registros_processados?: number
          url_consultada?: string | null
          mensagem?: string | null
          erro?: string | null
          registros_invalidos?: number
          detalhes_invalidos?: Json | null
        }
        Relationships: []
      }
      nfd_desconhecimentos: {
        Row: {
          id: string
          loja_id: string
          promotor_id: string
          nfd_referencia: string
          nfd_chave_acesso: string | null
          nfd_numero: string
          loja_codigo: string | null
          comentario: string
          created_at: string
        }
        Insert: {
          id?: string
          loja_id: string
          promotor_id: string
          nfd_referencia: string
          nfd_chave_acesso?: string | null
          nfd_numero: string
          loja_codigo?: string | null
          comentario: string
          created_at?: string
        }
        Update: {
          id?: string
          loja_id?: string
          promotor_id?: string
          nfd_referencia?: string
          nfd_chave_acesso?: string | null
          nfd_numero?: string
          loja_codigo?: string | null
          comentario?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'nfd_desconhecimentos_loja_id_fkey'
            columns: ['loja_id']
            isOneToOne: false
            referencedRelation: 'lojas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'nfd_desconhecimentos_promotor_id_fkey'
            columns: ['promotor_id']
            isOneToOne: false
            referencedRelation: 'usuarios'
            referencedColumns: ['id']
          },
        ]
      }
      produtos: {
        Row: {
          status: boolean | null
          nome: string | null
          codigos_vinculados: string | null
          ovos_und: number | null
          categoria: string | null
          imagem_url: string | null
          class_ia: string | null
          color_ia: string | null
          id: string
        }
        Insert: {
          status?: boolean | null
          nome?: string | null
          codigos_vinculados?: string | null
          ovos_und?: number | null
          categoria?: string | null
          imagem_url?: string | null
          class_ia?: string | null
          color_ia?: string | null
          id?: string
        }
        Update: {
          status?: boolean | null
          nome?: string | null
          codigos_vinculados?: string | null
          ovos_und?: number | null
          categoria?: string | null
          imagem_url?: string | null
          class_ia?: string | null
          color_ia?: string | null
          id?: string
        }
        Relationships: []
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
      fstd_processos: {
        Row: {
          id: string
          nfd_chave_acesso: string
          nfd_numero: string
          loja_id: string
          promotor_id: string
          status: 'em_andamento' | 'concluida' | 'cancelada'
          finalizada_em: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nfd_chave_acesso: string
          nfd_numero: string
          loja_id: string
          promotor_id: string
          status?: 'em_andamento' | 'concluida' | 'cancelada'
          finalizada_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nfd_chave_acesso?: string
          nfd_numero?: string
          loja_id?: string
          promotor_id?: string
          status?: 'em_andamento' | 'concluida' | 'cancelada'
          finalizada_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      fstd_produtos: {
        Row: {
          id: string
          processo_id: string
          produto_id: string | null
          codigo_produto: string
          nome: string
          descricao: string | null
          imagem_url: string | null
          quantidade_faturada_galinha: number
          quantidade_faturada_codorna: number
          quantidade_retorno: number
          motivo_id: string | null
          observacao: string | null
          fotos: Json
          status: 'pendente' | 'concluido'
          concluido_em: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          processo_id: string
          produto_id?: string | null
          codigo_produto: string
          nome: string
          descricao?: string | null
          imagem_url?: string | null
          quantidade_faturada_galinha?: number
          quantidade_faturada_codorna?: number
          quantidade_retorno?: number
          motivo_id?: string | null
          observacao?: string | null
          fotos?: Json
          status?: 'pendente' | 'concluido'
          concluido_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          processo_id?: string
          produto_id?: string | null
          codigo_produto?: string
          nome?: string
          descricao?: string | null
          imagem_url?: string | null
          quantidade_faturada_galinha?: number
          quantidade_faturada_codorna?: number
          quantidade_retorno?: number
          motivo_id?: string | null
          observacao?: string | null
          fotos?: Json
          status?: 'pendente' | 'concluido'
          concluido_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      fstd_produto_motivos: {
        Row: {
          id: string
          produto_id: string
          motivo_id: string
          quantidade_faturada: number
          quantidade: number
          created_at: string
        }
        Insert: {
          id?: string
          produto_id: string
          motivo_id: string
          quantidade_faturada: number
          quantidade: number
          created_at?: string
        }
        Update: {
          id?: string
          produto_id?: string
          motivo_id?: string
          quantidade_faturada?: number
          quantidade?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fstd_produto_motivos_produto_id_fkey'
            columns: ['produto_id']
            isOneToOne: false
            referencedRelation: 'fstd_produtos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fstd_produto_motivos_motivo_id_fkey'
            columns: ['motivo_id']
            isOneToOne: false
            referencedRelation: 'motivos_devolucao'
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
      nfd_notas: {
        Row: {
          chave_acesso: string | null
          estabelecimento: string | null
          nota_fiscal: number | null
          data_emissao: string | null
          data_referencia: string | null
          codigo_cliente: number | null
          nome_abreviado: string | null
          uf: Estado | null
          cidade: string | null
          quantidade_galinha: number | null
          valor_galinha: number | null
          quantidade_codorna: number | null
          valor_codorna: number | null
          valor_total: number | null
          quantidade_itens: number | null
          quantidade_produtos_distintos: number | null
          detalhes: Json | null
        }
        Relationships: []
      }
      produtos_expandidos: {
        Row: {
          produto_id: string | null
          produto_codigo_id: string | null
          codigo_produto: string | null
          status: boolean | null
          nome: string | null
          ovos_und: number | null
          categoria: string | null
          imagem_url: string | null
          class_ia: string | null
          color_ia: string | null
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
      update_gerencial_user: {
        Args: {
          p_usuario_id: string
          p_nome: string
          p_email: string
          p_ativo: boolean
        }
        Returns: Database['public']['Tables']['usuarios']['Row']
      }
      iniciar_fstd_produtos: {
        Args: {
          p_loja_id: string
          p_nfd_chave_acesso: string
          p_nfd_numero: string
          p_produtos: Json
        }
        Returns: string
      }
      iniciar_fstd_produtos_v2: {
        Args: {
          p_loja_id: string
          p_nfd_chave_acesso: string
        }
        Returns: string
      }
      concluir_fstd_produto: {
        Args: {
          p_produto_id: string
          p_divisoes: Json
          p_observacao?: string | null
          p_fotos?: Json
        }
        Returns: Database['public']['Tables']['fstd_produtos']['Row']
      }
      editar_fstd_produto: {
        Args: {
          p_produto_id: string
          p_divisoes: Json
          p_quantidade_faturada_galinha: number
          p_quantidade_faturada_codorna: number
          p_observacao?: string | null
          p_fotos?: Json
        }
        Returns: Database['public']['Tables']['fstd_produtos']['Row']
      }
      finalizar_fstd_produtos: {
        Args: {
          p_processo_id: string
        }
        Returns: Database['public']['Tables']['fstd_processos']['Row']
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
export type NfdDesconhecimento = Database['public']['Tables']['nfd_desconhecimentos']['Row']
export type Fstd = Database['public']['Tables']['fstds']['Row']
export type NfdNota = Database['public']['Views']['nfd_notas']['Row']
