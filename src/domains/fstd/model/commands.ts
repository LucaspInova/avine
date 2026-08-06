import type { SaveFstdProductCommand } from './types'

type ProductCommandInput = {
  productId: string
  completed: boolean
  standalone: boolean
  divisions: Array<{ reasonId: string; billed: number; returned: number }>
  observation?: string | null
  photoPaths: string[]
  billedChicken?: number
  billedQuail?: number
}

/** Builds the RPC boundary object shared by every FSTD presentation. */
export function buildSaveFstdProductCommand(input: ProductCommandInput): SaveFstdProductCommand {
  const rpcName = input.completed
    ? 'editar_fstd_produto'
    : input.standalone
      ? 'concluir_fstd_produto_avulso'
      : 'concluir_fstd_produto'
  const args = {
    p_produto_id: input.productId,
    p_divisoes: input.divisions.map((division) => ({
      motivo_id: division.reasonId,
      quantidade_faturada: division.billed,
      quantidade_retorno: division.returned,
    })),
    p_observacao: input.observation?.trim() || null,
    p_fotos: input.photoPaths,
    ...((input.completed || input.standalone) ? {
      p_quantidade_faturada_galinha: input.billedChicken ?? 0,
      p_quantidade_faturada_codorna: input.billedQuail ?? 0,
    } : {}),
  }
  return { rpcName, args } as SaveFstdProductCommand
}
