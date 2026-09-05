export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Estado =
  | "CE" | "MA" | "BA" | "PA" | "PB" | "PI" | "PE" | "AP" | "SE" | "RN" | "AL"

export type PerfilUsuario = "Promotor" | "Gerencial" | "Admin"

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      fstd_documento_versoes: {
        Row: {
          created_at: string
          documento_id: string
          gerado_por: string | null
          id: string
          pdf_metadata: Json
          pdf_path: string
          versao: number
        }
        Insert: {
          created_at?: string
          documento_id: string
          gerado_por?: string | null
          id?: string
          pdf_metadata?: Json
          pdf_path: string
          versao: number
        }
        Update: {
          created_at?: string
          documento_id?: string
          gerado_por?: string | null
          id?: string
          pdf_metadata?: Json
          pdf_path?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "fstd_documento_versoes_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "fstd_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fstd_documento_versoes_gerado_por_fkey"
            columns: ["gerado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      fstd_documentos: {
        Row: {
          conteudo_versao: number
          created_at: string
          id: string
          numero_controle: number
          pdf_erro: string | null
          pdf_metadata: Json
          pdf_path: string | null
          pdf_status: string
          processo_id: string
          updated_at: string
          versao_publicada: number
        }
        Insert: {
          conteudo_versao?: number
          created_at?: string
          id?: string
          numero_controle?: number
          pdf_erro?: string | null
          pdf_metadata?: Json
          pdf_path?: string | null
          pdf_status?: string
          processo_id: string
          updated_at?: string
          versao_publicada?: number
        }
        Update: {
          conteudo_versao?: number
          created_at?: string
          id?: string
          numero_controle?: number
          pdf_erro?: string | null
          pdf_metadata?: Json
          pdf_path?: string | null
          pdf_status?: string
          processo_id?: string
          updated_at?: string
          versao_publicada?: number
        }
        Relationships: [
          {
            foreignKeyName: "fstd_documentos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: true
            referencedRelation: "fstd_autoria"
            referencedColumns: ["processo_id"]
          },
          {
            foreignKeyName: "fstd_documentos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: true
            referencedRelation: "fstd_processos"
            referencedColumns: ["id"]
          },
        ]
      }
      fstd_legado: {
        Row: {
          codigo_loja: string
          created_at: string
          data_preenchimento: string | null
          id: string
          legado_id: number
          motivo: string | null
          numero_controle: string | null
          numero_nfd: string
          origem: string
          qtd_retorno_codorna: number | null
          qtd_retorno_galinha: number | null
          qtd_total_codorna: number | null
          qtd_total_galinha: number | null
          responsavel_fstd: string | null
          source_hash: string | null
        }
        Insert: {
          codigo_loja: string
          created_at?: string
          data_preenchimento?: string | null
          id: string
          legado_id?: number
          motivo?: string | null
          numero_controle?: string | null
          numero_nfd: string
          origem: string
          qtd_retorno_codorna?: number | null
          qtd_retorno_galinha?: number | null
          qtd_total_codorna?: number | null
          qtd_total_galinha?: number | null
          responsavel_fstd?: string | null
          source_hash?: string | null
        }
        Update: {
          codigo_loja?: string
          created_at?: string
          data_preenchimento?: string | null
          id?: string
          legado_id?: number
          motivo?: string | null
          numero_controle?: string | null
          numero_nfd?: string
          origem?: string
          qtd_retorno_codorna?: number | null
          qtd_retorno_galinha?: number | null
          qtd_total_codorna?: number | null
          qtd_total_galinha?: number | null
          responsavel_fstd?: string | null
          source_hash?: string | null
        }
        Relationships: []
      }
      fstd_legado_ajustes_totais: {
        Row: {
          atualizado_por: string
          created_at: string
          legado_id: number
          qtd_retorno_codorna: number
          qtd_retorno_galinha: number
          updated_at: string
        }
        Insert: {
          atualizado_por: string
          created_at?: string
          legado_id: number
          qtd_retorno_codorna: number
          qtd_retorno_galinha: number
          updated_at?: string
        }
        Update: {
          atualizado_por?: string
          created_at?: string
          legado_id?: number
          qtd_retorno_codorna?: number
          qtd_retorno_galinha?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fstd_legado_ajustes_totais_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fstd_legado_ajustes_totais_legado_id_fkey"
            columns: ["legado_id"]
            isOneToOne: true
            referencedRelation: "fstd_legado"
            referencedColumns: ["legado_id"]
          },
          {
            foreignKeyName: "fstd_legado_ajustes_totais_legado_id_fkey"
            columns: ["legado_id"]
            isOneToOne: true
            referencedRelation: "fstd_legado_canonico"
            referencedColumns: ["legado_id"]
          },
        ]
      }
      fstd_legado_import_staging: {
        Row: {
          codigo_loja: string
          data_preenchimento: string | null
          id: string
          import_id: number
          motivo: string | null
          numero_controle: string | null
          numero_nfd: string
          origem: string
          qtd_retorno_codorna: number | null
          qtd_retorno_galinha: number | null
          qtd_total_codorna: number | null
          qtd_total_galinha: number | null
          responsavel_fstd: string | null
          source_hash: string
          uploaded_at: string
        }
        Insert: {
          codigo_loja: string
          data_preenchimento?: string | null
          id: string
          import_id?: never
          motivo?: string | null
          numero_controle?: string | null
          numero_nfd: string
          origem: string
          qtd_retorno_codorna?: number | null
          qtd_retorno_galinha?: number | null
          qtd_total_codorna?: number | null
          qtd_total_galinha?: number | null
          responsavel_fstd?: string | null
          source_hash: string
          uploaded_at?: string
        }
        Update: {
          codigo_loja?: string
          data_preenchimento?: string | null
          id?: string
          import_id?: never
          motivo?: string | null
          numero_controle?: string | null
          numero_nfd?: string
          origem?: string
          qtd_retorno_codorna?: number | null
          qtd_retorno_galinha?: number | null
          qtd_total_codorna?: number | null
          qtd_total_galinha?: number | null
          responsavel_fstd?: string | null
          source_hash?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      fstd_processos: {
        Row: {
          api_nfd_chave_acesso: string | null
          atualizado_por: string | null
          conferencia_detalhes: Json
          conferencia_em: string | null
          conferencia_status: string
          created_at: string
          criado_por: string | null
          finalizada_em: string | null
          id: string
          is_avulsa: boolean
          loja_id: string
          modo_coleta: string
          nfd_chave_acesso: string
          nfd_data_emissao: string | null
          nfd_numero: string
          nfd_valor: number | null
          promotor_id: string
          status: string
          updated_at: string
        }
        Insert: {
          api_nfd_chave_acesso?: string | null
          atualizado_por?: string | null
          conferencia_detalhes?: Json
          conferencia_em?: string | null
          conferencia_status?: string
          created_at?: string
          criado_por?: string | null
          finalizada_em?: string | null
          id?: string
          is_avulsa?: boolean
          loja_id: string
          modo_coleta?: string
          nfd_chave_acesso: string
          nfd_data_emissao?: string | null
          nfd_numero: string
          nfd_valor?: number | null
          promotor_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          api_nfd_chave_acesso?: string | null
          atualizado_por?: string | null
          conferencia_detalhes?: Json
          conferencia_em?: string | null
          conferencia_status?: string
          created_at?: string
          criado_por?: string | null
          finalizada_em?: string | null
          id?: string
          is_avulsa?: boolean
          loja_id?: string
          modo_coleta?: string
          nfd_chave_acesso?: string
          nfd_data_emissao?: string | null
          nfd_numero?: string
          nfd_valor?: number | null
          promotor_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fstd_processos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fstd_processos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fstd_processos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fstd_processos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas_com_promotores"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "fstd_processos_promotor_id_fkey"
            columns: ["promotor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      fstd_produto_motivos: {
        Row: {
          created_at: string
          id: string
          motivo_id: string
          produto_id: string
          quantidade: number
          quantidade_faturada: number
        }
        Insert: {
          created_at?: string
          id?: string
          motivo_id: string
          produto_id: string
          quantidade: number
          quantidade_faturada: number
        }
        Update: {
          created_at?: string
          id?: string
          motivo_id?: string
          produto_id?: string
          quantidade?: number
          quantidade_faturada?: number
        }
        Relationships: [
          {
            foreignKeyName: "fstd_produto_motivos_motivo_id_fkey"
            columns: ["motivo_id"]
            isOneToOne: false
            referencedRelation: "motivos_devolucao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fstd_produto_motivos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "fstd_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      fstd_produtos: {
        Row: {
          codigo_produto: string
          concluido_em: string | null
          created_at: string
          descricao: string | null
          fotos: Json
          id: string
          imagem_url: string | null
          motivo_id: string | null
          nome: string
          observacao: string | null
          processo_id: string
          produto_id: string | null
          quantidade_faturada_codorna: number
          quantidade_faturada_galinha: number
          quantidade_retorno: number
          status: string
          updated_at: string
        }
        Insert: {
          codigo_produto: string
          concluido_em?: string | null
          created_at?: string
          descricao?: string | null
          fotos?: Json
          id?: string
          imagem_url?: string | null
          motivo_id?: string | null
          nome: string
          observacao?: string | null
          processo_id: string
          produto_id?: string | null
          quantidade_faturada_codorna?: number
          quantidade_faturada_galinha?: number
          quantidade_retorno?: number
          status?: string
          updated_at?: string
        }
        Update: {
          codigo_produto?: string
          concluido_em?: string | null
          created_at?: string
          descricao?: string | null
          fotos?: Json
          id?: string
          imagem_url?: string | null
          motivo_id?: string | null
          nome?: string
          observacao?: string | null
          processo_id?: string
          produto_id?: string | null
          quantidade_faturada_codorna?: number
          quantidade_faturada_galinha?: number
          quantidade_retorno?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fstd_produtos_motivo_id_fkey"
            columns: ["motivo_id"]
            isOneToOne: false
            referencedRelation: "motivos_devolucao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fstd_produtos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "fstd_autoria"
            referencedColumns: ["processo_id"]
          },
          {
            foreignKeyName: "fstd_produtos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "fstd_processos"
            referencedColumns: ["id"]
          },
        ]
      }
      fstd_resumos_agregados: {
        Row: {
          created_at: string
          fotos: Json
          motivo_id: string | null
          observacao: string | null
          processo_id: string
          quantidade_faturada_codorna: number
          quantidade_faturada_galinha: number
          quantidade_retorno_codorna: number
          quantidade_retorno_galinha: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fotos?: Json
          motivo_id?: string | null
          observacao?: string | null
          processo_id: string
          quantidade_faturada_codorna?: number
          quantidade_faturada_galinha?: number
          quantidade_retorno_codorna?: number
          quantidade_retorno_galinha?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fotos?: Json
          motivo_id?: string | null
          observacao?: string | null
          processo_id?: string
          quantidade_faturada_codorna?: number
          quantidade_faturada_galinha?: number
          quantidade_retorno_codorna?: number
          quantidade_retorno_galinha?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fstd_resumos_agregados_motivo_id_fkey"
            columns: ["motivo_id"]
            isOneToOne: false
            referencedRelation: "motivos_devolucao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fstd_resumos_agregados_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: true
            referencedRelation: "fstd_autoria"
            referencedColumns: ["processo_id"]
          },
          {
            foreignKeyName: "fstd_resumos_agregados_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: true
            referencedRelation: "fstd_processos"
            referencedColumns: ["id"]
          },
        ]
      }
      loja_import_alertas: {
        Row: {
          cidade_importada: string
          codigo: string
          fonte: string
          id: string
          loja_id: string | null
          nome_importado: string
          ocorrencias: number
          primeira_ocorrencia_em: string
          status: string
          tipo: string
          uf_importada: string
          ultima_ocorrencia_em: string
        }
        Insert: {
          cidade_importada: string
          codigo: string
          fonte: string
          id?: string
          loja_id?: string | null
          nome_importado: string
          ocorrencias?: number
          primeira_ocorrencia_em?: string
          status?: string
          tipo: string
          uf_importada: string
          ultima_ocorrencia_em?: string
        }
        Update: {
          cidade_importada?: string
          codigo?: string
          fonte?: string
          id?: string
          loja_id?: string | null
          nome_importado?: string
          ocorrencias?: number
          primeira_ocorrencia_em?: string
          status?: string
          tipo?: string
          uf_importada?: string
          ultima_ocorrencia_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "loja_import_alertas_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_import_alertas_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas_com_promotores"
            referencedColumns: ["loja_id"]
          },
        ]
      }
      loja_promotores: {
        Row: {
          created_at: string | null
          id: string
          loja_id: string | null
          posicao: number
          promotor_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          loja_id?: string | null
          posicao: number
          promotor_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          loja_id?: string | null
          posicao?: number
          promotor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loja_promotores_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_promotores_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas_com_promotores"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "loja_promotores_promotor_id_fkey"
            columns: ["promotor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      lojas: {
        Row: {
          cidade: string
          codigo: string
          created_at: string | null
          id: string
          nome: string
          uf: string
        }
        Insert: {
          cidade: string
          codigo: string
          created_at?: string | null
          id?: string
          nome: string
          uf: string
        }
        Update: {
          cidade?: string
          codigo?: string
          created_at?: string | null
          id?: string
          nome?: string
          uf?: string
        }
        Relationships: []
      }
      motivos_devolucao: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      nfd_desconhecimentos: {
        Row: {
          comentario: string
          created_at: string
          id: string
          loja_codigo: string | null
          loja_id: string
          nfd_chave_acesso: string | null
          nfd_numero: string
          nfd_referencia: string
          reconhecida_em: string | null
          reconhecida_por: string | null
          usuario_id: string
        }
        Insert: {
          comentario: string
          created_at?: string
          id?: string
          loja_codigo?: string | null
          loja_id: string
          nfd_chave_acesso?: string | null
          nfd_numero: string
          nfd_referencia: string
          reconhecida_em?: string | null
          reconhecida_por?: string | null
          usuario_id: string
        }
        Update: {
          comentario?: string
          created_at?: string
          id?: string
          loja_codigo?: string | null
          loja_id?: string
          nfd_chave_acesso?: string | null
          nfd_numero?: string
          nfd_referencia?: string
          reconhecida_em?: string | null
          reconhecida_por?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nfd_desconhecimentos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfd_desconhecimentos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas_com_promotores"
            referencedColumns: ["loja_id"]
          },
          {
            foreignKeyName: "nfd_desconhecimentos_promotor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfd_desconhecimentos_reconhecida_por_fkey"
            columns: ["reconhecida_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      nfd_itens: {
        Row: {
          atualizado_em: string
          chave_acesso: string
          cidade: string | null
          codigo_cliente: number
          codigo_produto: string
          criado_em: string
          data_emissao: string
          data_referencia: string
          descricao_produto: string | null
          estabelecimento: string
          id: number
          nome_abreviado: string | null
          nota_fiscal: number
          quantidade_codorna: number
          quantidade_galinha: number
          uf: string | null
          valor: number
          valor_codorna: number
          valor_galinha: number
        }
        Insert: {
          atualizado_em?: string
          chave_acesso: string
          cidade?: string | null
          codigo_cliente: number
          codigo_produto: string
          criado_em?: string
          data_emissao: string
          data_referencia: string
          descricao_produto?: string | null
          estabelecimento: string
          id?: number
          nome_abreviado?: string | null
          nota_fiscal: number
          quantidade_codorna?: number
          quantidade_galinha?: number
          uf?: string | null
          valor?: number
          valor_codorna?: number
          valor_galinha?: number
        }
        Update: {
          atualizado_em?: string
          chave_acesso?: string
          cidade?: string | null
          codigo_cliente?: number
          codigo_produto?: string
          criado_em?: string
          data_emissao?: string
          data_referencia?: string
          descricao_produto?: string | null
          estabelecimento?: string
          id?: number
          nome_abreviado?: string | null
          nota_fiscal?: number
          quantidade_codorna?: number
          quantidade_galinha?: number
          uf?: string | null
          valor?: number
          valor_codorna?: number
          valor_galinha?: number
        }
        Relationships: []
      }
      nfd_logs: {
        Row: {
          data_referencia: string
          detalhes_invalidos: Json | null
          erro: string | null
          finalizado_em: string | null
          fonte: string
          id: number
          iniciado_em: string
          mensagem: string | null
          registros_divergentes: number
          registros_existentes: number
          registros_invalidos: number
          registros_processados: number
          registros_recebidos: number
          status: string
          url_consultada: string | null
        }
        Insert: {
          data_referencia: string
          detalhes_invalidos?: Json | null
          erro?: string | null
          finalizado_em?: string | null
          fonte?: string
          id?: number
          iniciado_em?: string
          mensagem?: string | null
          registros_divergentes?: number
          registros_existentes?: number
          registros_invalidos?: number
          registros_processados?: number
          registros_recebidos?: number
          status?: string
          url_consultada?: string | null
        }
        Update: {
          data_referencia?: string
          detalhes_invalidos?: Json | null
          erro?: string | null
          finalizado_em?: string | null
          fonte?: string
          id?: number
          iniciado_em?: string
          mensagem?: string | null
          registros_divergentes?: number
          registros_existentes?: number
          registros_invalidos?: number
          registros_processados?: number
          registros_recebidos?: number
          status?: string
          url_consultada?: string | null
        }
        Relationships: []
      }
      produto_catalogo_auditoria: {
        Row: {
          acao: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json
          id: number
          produto_id: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos: Json
          id?: number
          produto_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json
          id?: number
          produto_id?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produto_catalogo_auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          categoria: string | null
          class_ia: string | null
          codigos_vinculados: string | null
          color_ia: string | null
          id: string
          imagem_url: string | null
          nome: string | null
          ovos_und: number | null
          status: boolean | null
        }
        Insert: {
          categoria?: string | null
          class_ia?: string | null
          codigos_vinculados?: string | null
          color_ia?: string | null
          id?: string
          imagem_url?: string | null
          nome?: string | null
          ovos_und?: number | null
          status?: boolean | null
        }
        Update: {
          categoria?: string | null
          class_ia?: string | null
          codigos_vinculados?: string | null
          color_ia?: string | null
          id?: string
          imagem_url?: string | null
          nome?: string | null
          ovos_und?: number | null
          status?: boolean | null
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          acesso_habilitado: boolean
          ativo: boolean
          auth_user_id: string | null
          created_at: string
          email: string
          estado: string
          foto_url: string | null
          fotos_habilitadas: boolean
          id: string
          last_access_at: string | null
          modo_coleta: string
          nome: string
          perfil: string
          ufs: string[]
        }
        Insert: {
          acesso_habilitado?: boolean
          ativo?: boolean
          auth_user_id?: string | null
          created_at?: string
          email: string
          estado: string
          foto_url?: string | null
          fotos_habilitadas?: boolean
          id?: string
          last_access_at?: string | null
          modo_coleta?: string
          nome: string
          perfil: string
          ufs?: string[]
        }
        Update: {
          acesso_habilitado?: boolean
          ativo?: boolean
          auth_user_id?: string | null
          created_at?: string
          email?: string
          estado?: string
          foto_url?: string | null
          fotos_habilitadas?: boolean
          id?: string
          last_access_at?: string | null
          modo_coleta?: string
          nome?: string
          perfil?: string
          ufs?: string[]
        }
        Relationships: []
      }
    }
    Views: {
      fstd_autoria: {
        Row: {
          atualizado_por: string | null
          atualizado_por_nome: string | null
          autoria_historica_inferida: boolean | null
          criado_por: string | null
          criado_por_nome: string | null
          processo_id: string | null
          promotor_rota_id: string | null
          promotor_rota_nome: string | null
          responsavel_nome: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fstd_processos_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fstd_processos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fstd_processos_promotor_id_fkey"
            columns: ["promotor_rota_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      fstd_legado_canonico: {
        Row: {
          codigo_loja: string | null
          created_at: string | null
          data_preenchimento: string | null
          id: string | null
          legado_id: number | null
          motivo: string | null
          numero_controle: string | null
          numero_nfd: string | null
          origem: string | null
          qtd_retorno_codorna: number | null
          qtd_retorno_galinha: number | null
          qtd_total_codorna: number | null
          qtd_total_galinha: number | null
          responsavel_fstd: string | null
          source_hash: string | null
        }
        Relationships: []
      }
      fstd_relatorio: {
        Row: {
          codorna_nfd: number | null
          codorna_retorno: number | null
          data_baixa: string | null
          data_emissao: string | null
          fstd: number | null
          galinha_nfd: number | null
          galinha_retorno: number | null
          id: string | null
          motivo_emissao: string | null
          motorista: string | null
          nfd: string | null
          nome_abreviado: string | null
          responsavel_fstd: string | null
          valor: number | null
          vl_codorna: number | null
          vl_galinha: number | null
        }
        Relationships: []
      }
      fstd_relatorio_produtos: {
        Row: {
          codorna_nfd: number | null
          codorna_retorno: number | null
          data_baixa: string | null
          data_emissao: string | null
          fstd: number | null
          galinha_nfd: number | null
          galinha_retorno: number | null
          id: string | null
          motivo_emissao: string | null
          motorista: string | null
          nfd: string | null
          nome_abreviado: string | null
          nome_produto: string | null
          responsavel_fstd: string | null
          valor: number | null
          vl_codorna: number | null
          vl_galinha: number | null
        }
        Relationships: []
      }
      lojas_com_promotores: {
        Row: {
          cidade: string | null
          codigo: string | null
          loja_id: string | null
          loja_nome: string | null
          promotor_1: string | null
          promotor_2: string | null
          promotor_3: string | null
          uf: string | null
        }
        Relationships: []
      }
      nfd_notas: {
        Row: {
          chave_acesso: string | null
          cidade: string | null
          codigo_cliente: number | null
          data_emissao: string | null
          data_referencia: string | null
          detalhes: Json | null
          estabelecimento: string | null
          nome_abreviado: string | null
          nota_fiscal: number | null
          quantidade_codorna: number | null
          quantidade_galinha: number | null
          quantidade_itens: number | null
          quantidade_produtos_distintos: number | null
          uf: string | null
          valor_codorna: number | null
          valor_galinha: number | null
          valor_total: number | null
        }
        Relationships: []
      }
      produtos_expandidos: {
        Row: {
          categoria: string | null
          class_ia: string | null
          codigo_produto: string | null
          color_ia: string | null
          imagem_url: string | null
          nome: string | null
          ovos_und: number | null
          produto_codigo_id: string | null
          produto_id: string | null
          status: boolean | null
        }
        Relationships: []
      }
      produtos_pendentes: {
        Row: {
          codigo_produto: string | null
          descricao_produto: string | null
          itens_count: number | null
          notas_count: number | null
          produto_sugerido_id: string | null
          produto_sugerido_nome: string | null
          quantidade_codorna: number | null
          quantidade_galinha: number | null
          similaridade: number | null
          ultima_data: string | null
        }
        Relationships: []
      }
      produtos_precos_unitarios: {
        Row: {
          categoria: string | null
          codigo_produto: string | null
          data_preco: string | null
          nome_produto: string | null
          ovos_por_embalagem: number | null
          preco_unitario: number | null
          quantidade_analisada: number | null
          registros_analisados: number | null
          tipo_ovo: string | null
          valor_analisado: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      ajustar_fstd_legado_totais: {
        Args: {
          p_legado_id: number
          p_qtd_retorno_codorna: number
          p_qtd_retorno_galinha: number
        }
        Returns: {
          codigo_loja: string
          created_at: string
          data_preenchimento: string | null
          id: string
          legado_id: number
          motivo: string | null
          numero_controle: string | null
          numero_nfd: string
          origem: string
          qtd_retorno_codorna: number | null
          qtd_retorno_galinha: number | null
          qtd_total_codorna: number | null
          qtd_total_galinha: number | null
          responsavel_fstd: string | null
          source_hash: string | null
        }
        SetofOptions: {
          from: "*"
          to: "fstd_legado"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      carregar_dashboard_gerencial: {
        Args: {
          p_cidade?: string
          p_data_final: string
          p_data_inicial: string
          p_uf?: string
        }
        Returns: Json
      }
      carregar_fontes_dashboard_gerencial: {
        Args: { p_chaves_acesso?: string[]; p_referencias_legadas?: Json }
        Returns: Json
      }
      concluir_fstd_produto: {
        Args: {
          p_divisoes: Json
          p_fotos?: Json
          p_observacao?: string
          p_produto_id: string
        }
        Returns: {
          codigo_produto: string
          concluido_em: string | null
          created_at: string
          descricao: string | null
          fotos: Json
          id: string
          imagem_url: string | null
          motivo_id: string | null
          nome: string
          observacao: string | null
          processo_id: string
          produto_id: string | null
          quantidade_faturada_codorna: number
          quantidade_faturada_galinha: number
          quantidade_retorno: number
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fstd_produtos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      concluir_fstd_produto_avulso: {
        Args: {
          p_divisoes: Json
          p_fotos?: Json
          p_observacao?: string
          p_produto_id: string
          p_quantidade_faturada_codorna: number
          p_quantidade_faturada_galinha: number
        }
        Returns: {
          codigo_produto: string
          concluido_em: string | null
          created_at: string
          descricao: string | null
          fotos: Json
          id: string
          imagem_url: string | null
          motivo_id: string | null
          nome: string
          observacao: string | null
          processo_id: string
          produto_id: string | null
          quantidade_faturada_codorna: number
          quantidade_faturada_galinha: number
          quantidade_retorno: number
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fstd_produtos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      conferir_fstd_avulsas: { Args: never; Returns: Json }
      desconhecer_nfd_gerencial: {
        Args: {
          p_comentario?: string
          p_loja_codigo: string
          p_loja_id: string
          p_nfd_chave_acesso: string
          p_nfd_numero: string
          p_nfd_referencia: string
        }
        Returns: {
          comentario: string
          created_at: string
          id: string
          loja_codigo: string | null
          loja_id: string
          nfd_chave_acesso: string | null
          nfd_numero: string
          nfd_referencia: string
          reconhecida_em: string | null
          reconhecida_por: string | null
          usuario_id: string
        }
        SetofOptions: {
          from: "*"
          to: "nfd_desconhecimentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      editar_fstd_produto: {
        Args: {
          p_divisoes: Json
          p_fotos?: Json
          p_observacao?: string
          p_produto_id: string
          p_quantidade_faturada_codorna: number
          p_quantidade_faturada_galinha: number
        }
        Returns: {
          codigo_produto: string
          concluido_em: string | null
          created_at: string
          descricao: string | null
          fotos: Json
          id: string
          imagem_url: string | null
          motivo_id: string | null
          nome: string
          observacao: string | null
          processo_id: string
          produto_id: string | null
          quantidade_faturada_codorna: number
          quantidade_faturada_galinha: number
          quantidade_retorno: number
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fstd_produtos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalizar_fstd_produtos: {
        Args: { p_processo_id: string }
        Returns: {
          api_nfd_chave_acesso: string | null
          atualizado_por: string | null
          conferencia_detalhes: Json
          conferencia_em: string | null
          conferencia_status: string
          created_at: string
          criado_por: string | null
          finalizada_em: string | null
          id: string
          is_avulsa: boolean
          loja_id: string
          modo_coleta: string
          nfd_chave_acesso: string
          nfd_data_emissao: string | null
          nfd_numero: string
          nfd_valor: number | null
          promotor_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fstd_processos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_fstd_document_payload: {
        Args: { p_processo_id: string }
        Returns: Json
      }
      get_or_create_fstd_document: {
        Args: { p_processo_id: string }
        Returns: {
          conteudo_versao: number
          created_at: string
          id: string
          numero_controle: number
          pdf_erro: string | null
          pdf_metadata: Json
          pdf_path: string | null
          pdf_status: string
          processo_id: string
          updated_at: string
          versao_publicada: number
        }
        SetofOptions: {
          from: "*"
          to: "fstd_documentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      iniciar_fstd_agregada: {
        Args: { p_loja_id: string; p_nfd_chave_acesso: string }
        Returns: string
      }
      iniciar_fstd_avulsa: {
        Args: {
          p_loja_id: string
          p_nfd_data_emissao: string
          p_nfd_numero: string
          p_nfd_valor: number
          p_produtos: Json
        }
        Returns: string
      }
      iniciar_fstd_produtos_v2: {
        Args: { p_loja_id: string; p_nfd_chave_acesso: string }
        Returns: string
      }
      listar_nfd_notas_gerencial: {
        Args: {
          p_atualizado_por_id?: string
          p_cidade?: string
          p_criado_por_id?: string
          p_data_final?: string
          p_data_inicial?: string
          p_deslocamento?: number
          p_direcao?: string
          p_limite?: number
          p_ordenar_por?: string
          p_pesquisa?: string
          p_promotor_rota_id?: string
          p_responsavel_id?: string
          p_status?: string
          p_uf?: string
        }
        Returns: Json
      }
      obter_fstd_legado: {
        Args: { p_codigo_loja: string; p_numero_nfd: string }
        Returns: {
          codigo_loja: string
          created_at: string
          data_preenchimento: string | null
          id: string
          legado_id: number
          motivo: string | null
          numero_controle: string | null
          numero_nfd: string
          origem: string
          qtd_retorno_codorna: number | null
          qtd_retorno_galinha: number | null
          qtd_total_codorna: number | null
          qtd_total_galinha: number | null
          responsavel_fstd: string | null
          source_hash: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "fstd_legado"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reabrir_fstd_avulsa_revisao: {
        Args: { p_processo_id: string }
        Returns: {
          api_nfd_chave_acesso: string | null
          atualizado_por: string | null
          conferencia_detalhes: Json
          conferencia_em: string | null
          conferencia_status: string
          created_at: string
          criado_por: string | null
          finalizada_em: string | null
          id: string
          is_avulsa: boolean
          loja_id: string
          modo_coleta: string
          nfd_chave_acesso: string
          nfd_data_emissao: string | null
          nfd_numero: string
          nfd_valor: number | null
          promotor_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fstd_processos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reconhecer_nfd_gerencial: {
        Args: {
          p_nfd_chave_acesso: string
          p_nfd_numero: string
          p_nfd_referencia: string
        }
        Returns: number
      }
      record_usuario_access: { Args: never; Returns: string }
      recuperar_fstd_documentos: { Args: never; Returns: number }
      salvar_fstd_agregada: {
        Args: {
          p_finalizar?: boolean
          p_fotos?: Json
          p_motivo_id: string
          p_observacao?: string
          p_processo_id: string
          p_quantidade_retorno_codorna: number
          p_quantidade_retorno_galinha: number
        }
        Returns: {
          api_nfd_chave_acesso: string | null
          atualizado_por: string | null
          conferencia_detalhes: Json
          conferencia_em: string | null
          conferencia_status: string
          created_at: string
          criado_por: string | null
          finalizada_em: string | null
          id: string
          is_avulsa: boolean
          loja_id: string
          modo_coleta: string
          nfd_chave_acesso: string
          nfd_data_emissao: string | null
          nfd_numero: string
          nfd_valor: number | null
          promotor_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fstd_processos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      salvar_produto_catalogo: {
        Args: {
          p_categoria: string
          p_codigos: string[]
          p_imagem_url?: string
          p_nome: string
          p_ovos_und: number
          p_produto_id: string
          p_status?: boolean
        }
        Returns: {
          categoria: string | null
          class_ia: string | null
          codigos_vinculados: string | null
          color_ia: string | null
          id: string
          imagem_url: string | null
          nome: string | null
          ovos_und: number | null
          status: boolean | null
        }
        SetofOptions: {
          from: "*"
          to: "produtos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_fstd_document_pdf: {
        Args: {
          p_document_id: string
          p_pdf_metadata?: Json
          p_pdf_path: string
        }
        Returns: {
          conteudo_versao: number
          created_at: string
          id: string
          numero_controle: number
          pdf_erro: string | null
          pdf_metadata: Json
          pdf_path: string | null
          pdf_status: string
          processo_id: string
          updated_at: string
          versao_publicada: number
        }
        SetofOptions: {
          from: "*"
          to: "fstd_documentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sincronizar_lojas_importadas: {
        Args: { p_fonte: string; p_lojas: Json }
        Returns: Json
      }
      vincular_codigo_produto: {
        Args: { p_codigo: string; p_produto_id: string }
        Returns: {
          categoria: string | null
          class_ia: string | null
          codigos_vinculados: string | null
          color_ia: string | null
          id: string
          imagem_url: string | null
          nome: string | null
          ovos_und: number | null
          status: boolean | null
        }
        SetofOptions: {
          from: "*"
          to: "produtos"
          isOneToOne: true
          isSetofReturn: false
        }
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

export type Usuario = Database["public"]["Tables"]["usuarios"]["Row"]
export type UsuarioInsert = Database["public"]["Tables"]["usuarios"]["Insert"]
export type UsuarioUpdate = Database["public"]["Tables"]["usuarios"]["Update"]

export type Loja = Database["public"]["Tables"]["lojas"]["Row"]
export type LojaInsert = Database["public"]["Tables"]["lojas"]["Insert"]
export type LojaUpdate = Database["public"]["Tables"]["lojas"]["Update"]

export type LojaPromotor = Database["public"]["Tables"]["loja_promotores"]["Row"]
export type LojaPromotorInsert = Database["public"]["Tables"]["loja_promotores"]["Insert"]
export type LojaPromotorUpdate = Database["public"]["Tables"]["loja_promotores"]["Update"]

export type LojaComPromotores = Database["public"]["Views"]["lojas_com_promotores"]["Row"]
export type MotivoDevolucao = Database["public"]["Tables"]["motivos_devolucao"]["Row"]
export type NfdDesconhecimento = Database["public"]["Tables"]["nfd_desconhecimentos"]["Row"]
export type NfdNota = Database["public"]["Views"]["nfd_notas"]["Row"]
