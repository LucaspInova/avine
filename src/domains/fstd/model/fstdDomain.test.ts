import { describe, expect, it } from 'vitest'
import { buildSaveFstdProductCommand } from './commands'
import { getFstdDivisionDefaults, splitBilledQuantity } from './calculations'
import { validateFstdDivisions, validateFstdFinalization, validateFstdPhoto, validateFstdProduct } from './validation'

describe('regras de produto FSTD', () => {
  it('divide faturamento conforme a espécie e restaura divisões persistidas', () => {
    expect(splitBilledQuantity({ quantidade_faturada_galinha: 8, quantidade_faturada_codorna: 2 }, 6)).toEqual({ galinha: 6, codorna: 0 })
    expect(getFstdDivisionDefaults({ motivo_id: null, quantidade_faturada_galinha: 3, quantidade_faturada_codorna: 0, divisions: [{ motivo_id: 'm1', quantidade_faturada: 3, quantidade: 1 }] } as never)).toEqual([{ reasonId: 'm1', billed: '3', returned: '1' }])
  })
  it('exige motivo, total faturado exato, retorno válido e foto', () => {
    const valid = [{ reasonId: 'm1', billed: 5, returned: 0 }]
    expect(validateFstdDivisions(valid, 5)).toBe(true)
    expect(validateFstdDivisions([{ reasonId: '', billed: 5, returned: 0 }], 5)).toBe(false)
    expect(validateFstdProduct({ divisions: valid, billedTotal: 5, photoCount: 0 })).toBe(false)
    expect(validateFstdProduct({ divisions: valid, billedTotal: 5, photoCount: 1 })).toBe(true)
  })
  it('aceita imagens suportadas e rejeita formato ou tamanho inválidos', () => {
    expect(() => validateFstdPhoto({ type: 'image/jpeg', size: 10 })).not.toThrow()
    expect(() => validateFstdPhoto({ type: 'application/pdf', size: 10 })).toThrow(/JPG/)
    expect(() => validateFstdPhoto({ type: 'image/png', size: 11 * 1024 * 1024 })).toThrow(/10 MB/)
  })
  it('impede finalização sem processo', () => expect(() => validateFstdFinalization(null)).toThrow(/todos os produtos/))
})

describe('comandos das RPCs FSTD', () => {
  const base = { productId: 'produto-1', divisions: [{ reasonId: 'motivo-1', billed: 12, returned: 2 }], observation: ' avaria ', photoPaths: ['foto.jpg'] }
  it.each([
    [{ completed: false, standalone: false }, 'concluir_fstd_produto'],
    [{ completed: false, standalone: true }, 'concluir_fstd_produto_avulso'],
    [{ completed: true, standalone: false }, 'editar_fstd_produto'],
  ] as const)('monta os argumentos para %s', (state, rpcName) => {
    expect(buildSaveFstdProductCommand({ ...base, ...state, billedChicken: 10, billedQuail: 2 })).toEqual(expect.objectContaining({ rpcName, args: expect.objectContaining({ p_produto_id: 'produto-1', p_observacao: 'avaria', p_fotos: ['foto.jpg'], p_divisoes: [{ motivo_id: 'motivo-1', quantidade_faturada: 12, quantidade_retorno: 2 }] }) }))
  })
})
