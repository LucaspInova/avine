import { describe, expect, it } from 'vitest'
import { applyNfdStatuses, collectDashboardReasonIds } from './dashboardRepository'
import type { DashboardFstdProcess, DashboardLegacyFstd, DashboardNote, DashboardUnknownNfd } from './types'

function note(chaveAcesso: string, numero: number): DashboardNote {
  return {
    chave_acesso: chaveAcesso,
    estabelecimento: 'Loja',
    nota_fiscal: numero,
    data_emissao: '2026-08-10',
    data_referencia: '2026-08-10',
    codigo_cliente: 1,
    nome_abreviado: 'Loja',
    uf: 'CE',
    cidade: 'Fortaleza',
    quantidade_galinha: 10,
    quantidade_codorna: 0,
    valor_total: 100,
    status: 'Pendente',
  }
}

describe('status das NFDs da dashboard', () => {
  it('preserva a precedência da RPC sem executar a consulta pesada', () => {
    const processes: DashboardFstdProcess[] = [
      { id: 'old', nfd_chave_acesso: 'cancelada', status: 'concluida', finalizada_em: '2026-08-10', created_at: '2026-08-10T08:00:00Z', is_avulsa: false },
      { id: 'new', nfd_chave_acesso: 'cancelada', status: 'cancelada', finalizada_em: null, created_at: '2026-08-10T09:00:00Z', is_avulsa: false },
      { id: 'done', nfd_chave_acesso: 'moderna', status: 'concluida', finalizada_em: '2026-08-10', created_at: '2026-08-10T08:00:00Z', is_avulsa: false },
    ]
    const legacy: DashboardLegacyFstd[] = [{ legado_id: 1, codigo_loja: '1', numero_nfd: '1', data_preenchimento: null, motivo: null, qtd_total_galinha: 0, qtd_retorno_galinha: 0, qtd_total_codorna: 0, qtd_retorno_codorna: 0 }]
    const unknown: DashboardUnknownNfd[] = [
      { nfd_chave_acesso: 'legado', nfd_referencia: '1:1', loja_codigo: '1', nfd_numero: '1' },
      { nfd_chave_acesso: 'moderna', nfd_referencia: '1:2', loja_codigo: '1', nfd_numero: '2' },
    ]

    const result = applyNfdStatuses(
      [note('legado', 1), note('moderna', 2), note('cancelada', 3), note('pendente', 4)],
      { startDate: '2026-08-01', endDate: '2026-08-31' },
      processes,
      legacy,
      unknown,
    )

    expect(result.map((item) => item.status)).toEqual(['Finalizada', 'Finalizada', 'Pendente', 'Pendente'])
  })
})

describe('motivos carregados pela dashboard', () => {
  it('inclui motivos das divisões quando o produto não possui motivo direto', () => {
    expect(collectDashboardReasonIds(
      [{ motivo_id: 'motivo-direto' }, { motivo_id: null }],
      [{ motivo_id: 'motivo-divisao' }, { motivo_id: 'motivo-direto' }],
    )).toEqual(['motivo-direto', 'motivo-divisao'])
  })
})
