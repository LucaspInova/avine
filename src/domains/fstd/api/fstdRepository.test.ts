import { describe, expect, it, vi } from 'vitest'
import { createFstdRepository } from './fstdRepository'

function mockClient() {
  const rpc = vi.fn().mockResolvedValue({ data: 'ok', error: null })
  const upload = vi.fn().mockResolvedValue({ data: { path: 'saved/photo.jpg' }, error: null })
  const remove = vi.fn().mockResolvedValue({ error: null })
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed' }, error: null })
  return { client: { rpc, storage: { from: vi.fn(() => ({ upload, remove, createSignedUrl })) } } as never, rpc, upload, remove }
}

describe('FSTD repository com Supabase mockado', () => {
  it('traduz casos de uso em RPCs sem alterar o comando', async () => {
    const { client, rpc } = mockClient(); const repository = createFstdRepository(client)
    await repository.startStandalone({ storeId: 'l1', number: ' 123 ', value: 42, issueDate: '2026-08-06', products: [{ codigo_produto: 'A' }] })
    await repository.startProducts('l1', 'chave')
    await repository.finalize('processo-1')
    expect(rpc.mock.calls).toEqual([
      ['iniciar_fstd_avulsa', { p_loja_id: 'l1', p_nfd_numero: '123', p_nfd_valor: 42, p_nfd_data_emissao: '2026-08-06', p_produtos: [{ codigo_produto: 'A' }] }],
      ['iniciar_fstd_produtos_v2', { p_loja_id: 'l1', p_nfd_chave_acesso: 'chave' }],
      ['finalizar_fstd_produtos', { p_processo_id: 'processo-1' }],
    ])
  })
  it('valida antes do upload e remove somente quando há arquivos', async () => {
    const { client, upload, remove } = mockClient(); const repository = createFstdRepository(client)
    await expect(repository.uploadPhoto('fstd-fotos', 'p', { type: 'application/pdf', size: 1 } as File)).rejects.toThrow(/JPG/)
    expect(upload).not.toHaveBeenCalled()
    await expect(repository.uploadPhoto('fstd-fotos', 'p', { type: 'image/png', size: 1 } as File)).resolves.toBe('saved/photo.jpg')
    await repository.removeFiles('fstd-fotos', [])
    expect(remove).not.toHaveBeenCalled()
  })
  it('propaga falhas do Supabase', async () => {
    const { client, rpc } = mockClient(); rpc.mockResolvedValueOnce({ data: null, error: new Error('database') })
    await expect(createFstdRepository(client).finalize('p1')).rejects.toThrow('database')
  })
})
