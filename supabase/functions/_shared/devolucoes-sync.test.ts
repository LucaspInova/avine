import { describe, expect, it, vi } from 'vitest'
import { syncLojas, type DevolucaoDatabase } from './devolucoes-sync'

function item(patch: Partial<DevolucaoDatabase> = {}): DevolucaoDatabase {
  return {
    estabelecimento: 'TESTE',
    nota_fiscal: 1,
    chave_acesso: 'CHAVE',
    data_emissao: '2026-09-05',
    valor: 10,
    quantidade_galinha: 1,
    valor_galinha: 10,
    quantidade_codorna: 0,
    valor_codorna: 0,
    codigo_cliente: 900010,
    nome_abreviado: 'LOJA IMPORTADA',
    uf: 'ce',
    cidade: 'Fortaleza',
    codigo_produto: 'PRODUTO',
    descricao_produto: 'Produto',
    data_referencia: '2026-09-05',
    atualizado_em: '2026-09-05T12:00:00Z',
    ...patch,
  }
}

describe('sincronização de lojas dos importadores', () => {
  it('deduplica o código e preserva a ocorrência com cadastro mais completo', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { inseridas: 1, inalteradas: 0, divergentes: 0, invalidas: 0 },
      error: null,
    })

    await expect(syncLojas({ rpc }, [
      item(),
      item({ nome_abreviado: null, uf: null, cidade: null, codigo_produto: 'OUTRO' }),
    ], 'api')).resolves.toEqual({ inseridas: 1, inalteradas: 0, divergentes: 0, invalidas: 0 })

    expect(rpc).toHaveBeenCalledWith('sincronizar_lojas_importadas', {
      p_lojas: [{ codigo: '900010', nome: 'LOJA IMPORTADA', uf: 'CE', cidade: 'Fortaleza' }],
      p_fonte: 'api',
    })
  })

  it('propaga a falha transacional sem continuar a importação silenciosamente', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'falha do banco' } })
    await expect(syncLojas({ rpc }, [item()], 'sheets'))
      .rejects.toThrow('Não foi possível sincronizar as lojas: falha do banco')
  })
})
