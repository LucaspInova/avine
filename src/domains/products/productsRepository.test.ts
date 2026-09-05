import { describe, expect, it, vi } from 'vitest'
import {
  createProductsRepository,
  splitProductCodes,
  validateProductImage,
} from './productsRepository'

function productsClient() {
  const catalog = [{ id: 'produto-1', nome: 'EB C/30', codigos_vinculados: 'COD-A' }]
  const pending = [{ codigo_produto: 'COD-NOVO', notas_count: 2 }]
  const rpc = vi.fn(async (name, payload) => ({ data: { id: 'produto-1', ...payload }, error: null }))
  const from = vi.fn((table: string) => {
    const query: any = {
      select: vi.fn(() => query),
      order: vi.fn(() => query),
      then: (resolve: (value: unknown) => unknown) => resolve({
        data: table === 'produtos' ? catalog : pending,
        error: null,
      }),
    }
    return query
  })
  return { client: { from, rpc }, rpc }
}

describe('catálogo de produtos', () => {
  it('normaliza e remove códigos repetidos', () => {
    expect(splitProductCodes(' cod-b ;COD-A;cod-b;;')).toEqual(['COD-B', 'COD-A'])
  })

  it('recusa tipo e tamanho de imagem fora do contrato', () => {
    expect(() => validateProductImage(new File(['x'], 'foto.gif', { type: 'image/gif' })))
      .toThrow('Use uma imagem JPG, PNG ou WebP.')
    expect(() => validateProductImage(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'foto.png', { type: 'image/png' })))
      .toThrow('A imagem deve ter no máximo 5 MB.')
  })

  it('lista catálogo e pendências e usa apenas os RPCs protegidos para alterações', async () => {
    const { client, rpc } = productsClient()
    const repository = createProductsRepository(client)

    await expect(repository.listProducts()).resolves.toHaveLength(1)
    await expect(repository.listPendingProducts()).resolves.toHaveLength(1)
    await repository.saveProduct({
      nome: 'GB C/15',
      codigos: ['10PA01.014GD02'],
      ovosUnd: 15,
      categoria: 'Grande',
      status: true,
    })
    await repository.linkProductCode('produto-1', '10PA01.017EX23')

    expect(rpc).toHaveBeenNthCalledWith(1, 'salvar_produto_catalogo', {
      p_produto_id: null,
      p_nome: 'GB C/15',
      p_codigos: ['10PA01.014GD02'],
      p_ovos_und: 15,
      p_categoria: 'Grande',
      p_imagem_url: null,
      p_status: true,
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'vincular_codigo_produto', {
      p_produto_id: 'produto-1',
      p_codigo: '10PA01.017EX23',
    })
  })
})
