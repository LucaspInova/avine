import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductCatalogScreen } from './ProductCatalogScreen'

const mocks = vi.hoisted(() => ({
  listProducts: vi.fn(),
  listPendingProducts: vi.fn(),
  saveProduct: vi.fn(),
  linkProductCode: vi.fn(),
  uploadProductImage: vi.fn(),
}))

vi.mock('../../../../domains/products', () => ({
  ...mocks,
  splitProductCodes: (value = '') => [...new Set(value.split(';').map((code) => code.trim().toUpperCase()).filter(Boolean))],
}))

const catalog = [{
  id: 'produto-1',
  nome: 'EB C/30',
  codigos_vinculados: '10PA01.017EX02',
  ovos_und: 30,
  categoria: 'Alto Giro Bco',
  imagem_url: null,
  status: true,
}]

const pending = [{
  codigo_produto: '10PA01.017EX23',
  descricao_produto: 'EB C/30 Cuisine e Co',
  itens_count: 8,
  notas_count: 5,
  ultima_data: '2026-09-05',
  quantidade_galinha: 240,
  quantidade_codorna: 0,
  produto_sugerido_id: 'produto-1',
  produto_sugerido_nome: 'EB C/30',
  similaridade: 0.91,
}]

describe('tela gerencial de produtos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listProducts.mockResolvedValue(catalog)
    mocks.listPendingProducts.mockResolvedValue(pending)
    mocks.saveProduct.mockResolvedValue({ id: 'produto-2' })
    mocks.linkProductCode.mockResolvedValue(catalog[0])
  })

  it('mostra catálogo e permite abrir o cadastro manual', async () => {
    render(<ProductCatalogScreen search="" onSearch={vi.fn()} />)

    expect(await screen.findByText('EB C/30')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ Novo produto' }))
    expect(screen.getByRole('heading', { name: 'Cadastrar produto' })).toBeInTheDocument()
    expect(screen.getByText('Códigos vinculados')).toBeInTheDocument()
    expect(screen.getByText('Enviar nova foto')).toBeInTheDocument()
  })

  it('exige confirmação humana e vincula o código pendente ao produto escolhido', async () => {
    render(<ProductCatalogScreen search="" onSearch={vi.fn()} />)

    await screen.findByText('EB C/30')
    fireEvent.click(screen.getByRole('tab', { name: /Pendentes/ }))
    expect(screen.getByText('EB C/30 Cuisine e Co')).toBeInTheDocument()
    expect(screen.getByText(/Sugestão:/)).toHaveTextContent('91%')
    fireEvent.click(screen.getByRole('button', { name: 'Vincular como alias' }))

    await waitFor(() => expect(mocks.linkProductCode).toHaveBeenCalledWith('produto-1', '10PA01.017EX23'))
    expect(mocks.listProducts).toHaveBeenCalledTimes(2)
    expect(mocks.listPendingProducts).toHaveBeenCalledTimes(2)
  })
})
