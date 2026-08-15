import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FinancialChart, ManagementListModal, ProductsModal } from './ManagementDashboard'
import { getGaugeTone } from './dashboardVisualUtils'

describe('cores do percentual do velocímetro', () => {
  it('segue as três faixas visuais solicitadas', () => {
    expect(getGaugeTone(18.9)).toBe('danger')
    expect(getGaugeTone(45)).toBe('warning')
    expect(getGaugeTone(82)).toBe('success')
  })
})

describe('tooltip do gráfico financeiro', () => {
  it('exibe a data e o valor real ao passar por um ponto', () => {
    render(<FinancialChart data={[
      { date: '2026-08-05', value: 54299.72 },
      { date: '2026-08-06', value: 32450 },
    ]} />)

    fireEvent.mouseEnter(screen.getAllByRole('button')[0])

    expect(screen.getByText('05 de agosto de 2026')).toBeInTheDocument()
    expect(screen.getByText(/54\.299,72/)).toBeInTheDocument()
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('r', '24')
  })
})

describe('modal completo de lojas', () => {
  it('pesquisa pelo nome, pagina e fecha sem alterar os dados', () => {
    const stores = Array.from({ length: 21 }, (_, index) => ({
      name: index === 0 ? 'Sendas Batis' : `Loja ${index + 1}`,
      billed: 1000 - index,
      returnPercentage: index,
      returns: index,
    }))
    const onClose = vi.fn()

    render(
      <ManagementListModal
        title="Lojas com menor índice de retorno"
        modalId="stores-modal-title"
        itemLabel="lojas"
        searchPlaceholder="Buscar loja..."
        searchLabel="Buscar loja"
        emptyMessage="Nenhuma loja encontrada."
        searchEmptyMessage="Não encontramos lojas para esta busca."
        columns={[
          { key: 'name', label: 'Loja', render: (store) => store.name },
          { key: 'billed', label: 'Qtd. faturada', render: (store) => store.billed },
          { key: 'percentage', label: '% retorno', render: (store) => `${store.returnPercentage}%` },
          { key: 'returns', label: 'Devoluções', render: (store) => store.returns },
        ]}
        items={stores}
        getSearchText={(store) => store.name}
        getItemKey={(store) => store.name}
        isOpen
        onClose={onClose}
      />,
    )

    expect(screen.getByText('1–20 de 21 lojas')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar loja' }), { target: { value: 'sendas' } })
    expect(screen.getByText('Sendas Batis')).toBeInTheDocument()
    expect(screen.getByText('1–1 de 1 lojas')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar loja' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(screen.getByText('21–21 de 21 lojas')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar lojas com menor índice de retorno' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('ordenação das tabelas do dashboard', () => {
  it('alterna entre ordem crescente e decrescente sem tratar a coluna como filtro', () => {
    render(
      <ManagementListModal
        title="Lojas com menor índice de retorno"
        modalId="stores-sort-modal-title"
        itemLabel="lojas"
        searchPlaceholder="Buscar loja..."
        searchLabel="Buscar loja"
        emptyMessage="Nenhuma loja encontrada."
        searchEmptyMessage="Não encontramos lojas para esta busca."
        items={[
          { name: 'Loja maior', billed: 1200 },
          { name: 'Loja menor', billed: 120 },
        ]}
        getSearchText={(store) => store.name}
        getItemKey={(store) => store.name}
        columns={[
          { key: 'name', label: 'Loja', sortValue: (store) => store.name, render: (store) => store.name },
          { key: 'billed', label: 'Qtd. faturada', sortValue: (store) => store.billed, render: (store) => store.billed },
        ]}
        isOpen
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Qtd. faturada em ordem crescente' }))
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Loja menor')
    expect(screen.getByRole('columnheader', { name: /Qtd\. faturada/ })).toHaveAttribute('aria-sort', 'ascending')

    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Qtd. faturada em ordem decrescente' }))
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Loja maior')
    expect(screen.getByRole('columnheader', { name: /Qtd\. faturada/ })).toHaveAttribute('aria-sort', 'descending')

    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Qtd. faturada em ordem original' }))
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Loja maior')
    expect(screen.getByRole('columnheader', { name: /Qtd\. faturada/ })).toHaveAttribute('aria-sort', 'none')
  })
})

describe('linha de total dos produtos', () => {
  it('consolida faturado, retorno, percentual e motivo principal da busca ativa', () => {
    render(<ProductsModal
      products={[
        { name: 'Produto A', category: 'Galinha', billed: 100, returned: 10, returnPercentage: 10, mainReason: 'Avaria no PDV' },
        { name: 'Produto B', category: 'Codorna', billed: 200, returned: 50, returnPercentage: 25, mainReason: 'Avaria na entrega' },
      ]}
      errors={[]}
      isOpen
      onClose={vi.fn()}
    />)

    expect(screen.getByText('Total faturado')).toBeInTheDocument()
    expect(screen.getByText('300 ovos')).toBeInTheDocument()
    expect(screen.getByText('60 ovos')).toBeInTheDocument()
    expect(screen.getByText('20,0%')).toBeInTheDocument()
    expect(screen.getAllByText('Avaria na entrega')).toHaveLength(2)

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar produto' }), { target: { value: 'Produto A' } })
    expect(screen.getAllByText('100 ovos')).toHaveLength(2)
    expect(screen.getAllByText('10 ovos')).toHaveLength(2)
    expect(screen.getAllByText('10,0%')).toHaveLength(2)
    expect(screen.getAllByText('Avaria no PDV')).toHaveLength(2)
  })
})

describe('modal completo de motivos', () => {
  it('mantém o ranking, a barra proporcional e a variação sem período anterior', () => {
    const onClose = vi.fn()
    render(
      <ManagementListModal
        title="Principais motivos de devolução"
        modalId="reasons-modal-title"
        itemLabel="motivos"
        searchPlaceholder="Buscar motivo..."
        searchLabel="Buscar motivo"
        emptyMessage="Nenhum motivo encontrado."
        searchEmptyMessage="Nenhum motivo encontrado para esta busca."
        items={[{ name: 'Avaria de viagem', rank: 1, quantity: 12981, percentage: 44.6, evolutionAvailable: false, evolution: { direction: 'neutral', value: 0 } }]}
        getSearchText={(reason) => reason.name}
        getItemKey={(reason) => reason.name}
        columns={[
          { key: 'rank', label: '#', render: (reason) => <span className="management-dashboard__reason-rank">{reason.rank}</span> },
          { key: 'name', label: 'Motivo', render: (reason) => reason.name },
          { key: 'bar', label: '', render: (reason) => <span style={{ width: `${reason.percentage}%` }} /> },
          { key: 'quantity', label: 'Devoluções', render: (reason) => reason.quantity.toLocaleString('pt-BR') },
          { key: 'percentage', label: '% do total', render: (reason) => `${reason.percentage.toLocaleString('pt-BR')}%` },
          { key: 'evolution', label: 'Variação', render: (reason) => reason.evolutionAvailable ? '↑ 1,0%' : '—' },
        ]}
        isOpen
        onClose={onClose}
      />, 
    )

    expect(screen.getByText('Avaria de viagem')).toBeInTheDocument()
    expect(screen.getByText('12.981')).toBeInTheDocument()
    expect(screen.getByText('44,6%')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
