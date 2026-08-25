import { describe, expect, it } from 'vitest'
import { buildAttachedPhotoNfds } from './attachedPhotosRepository.js'

describe('buildAttachedPhotoNfds', () => {
  it('agrupa todas as fotos e produtos da mesma NFD em um único card', () => {
    const records = buildAttachedPhotoNfds({
      processes: [{ id: 'processo-1', nfd_chave_acesso: 'chave-1', nfd_numero: '148432', loja_id: 'loja-1', promotor_id: 'promotor-1', finalizada_em: '2026-08-24T18:00:00Z', updated_at: '2026-08-24T18:00:00Z' }],
      products: [
        { processo_id: 'processo-1', nome: 'EB 20×1', fotos: ['eb-1.jpg', 'eb-2.jpg'], quantidade_faturada_galinha: 20, quantidade_retorno: 6, concluido_em: '2026-08-24T17:00:00Z' },
        { processo_id: 'processo-1', nome: 'GB 30×1', fotos: ['gb-1.jpg', 'eb-1.jpg'], quantidade_faturada_codorna: 30, quantidade_retorno: 8, concluido_em: '2026-08-24T18:00:00Z' },
        { processo_id: 'processo-1', nome: 'OVOS CODORNA 30×1', fotos: [] },
      ],
      stores: [{ id: 'loja-1', nome: 'MAT CASTANHA' }],
      users: [{ id: 'promotor-1', nome: 'FABIANE RODRIGUES' }],
      signedUrls: new Map([['eb-1.jpg', 'signed-eb-1'], ['eb-2.jpg', 'signed-eb-2'], ['gb-1.jpg', 'signed-gb-1']]),
    })

    expect(records).toEqual([
      expect.objectContaining({
        nfdNumber: '148432',
        storeName: 'MAT CASTANHA',
        promoterName: 'FABIANE RODRIGUES',
        accessKey: 'chave-1',
        finalizedAt: '2026-08-24T18:00:00Z',
        products: ['EB 20×1', 'GB 30×1', 'OVOS CODORNA 30×1'],
        photos: [
          { path: 'eb-1.jpg', url: 'signed-eb-1' },
          { path: 'eb-2.jpg', url: 'signed-eb-2' },
          { path: 'gb-1.jpg', url: 'signed-gb-1' },
        ],
        quantities: { billedChicken: 20, billedQuail: 30, returnedChicken: 6, returnedQuail: 8 },
      }),
    ])
  })

  it('descarta processos sem fotos disponíveis', () => {
    const records = buildAttachedPhotoNfds({
      processes: [{ id: 'processo-1', nfd_numero: '10' }],
      products: [{ processo_id: 'processo-1', nome: 'EB 20×1', fotos: [] }],
      stores: [],
      users: [],
      signedUrls: new Map(),
    })

    expect(records).toEqual([])
  })
})
