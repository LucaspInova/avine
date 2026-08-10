import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PageToolbar } from './PageToolbar.jsx'

describe('PageToolbar', () => {
  it('organiza título, busca, filtros e slot de ação primária', () => {
    const onChange = vi.fn()
    render(
      <PageToolbar
        title="Lojas"
        activeFilterCount={3}
        search={{ label: 'Pesquisar lojas', placeholder: 'Pesquisar', value: '', onChange }}
        actions={<button type="button">Cadastrar Loja</button>}
      >
        <button type="button">Filtrar</button>
      </PageToolbar>,
    )

    expect(screen.getByRole('heading', { name: /Lojas/ })).toBeVisible()
    expect(screen.getByLabelText('3 filtros ativos')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Filtrar' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cadastrar Loja' })).toBeVisible()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar lojas' }), { target: { value: 'Matriz' } })
    expect(onChange).toHaveBeenCalledWith('Matriz', expect.anything())
  })

  it('permite omitir título e pesquisa', () => {
    render(<PageToolbar actions={<button type="button">Cadastrar Usuário</button>} />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cadastrar Usuário' })).toBeVisible()
  })
})
