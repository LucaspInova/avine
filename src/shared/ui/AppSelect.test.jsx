import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppSelect } from './AppSelect.jsx'

describe('AppSelect', () => {
  it('preserva o select fechado e seleciona pelo valor original', () => {
    const onChange = vi.fn()
    render(
      <AppSelect value="ativo" onChange={onChange}>
        <option value="">Todos</option>
        <option value="ativo">Ativo</option>
        <option value="inativo">Inativo</option>
      </AppSelect>,
    )

    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('ativo')
    expect(document.querySelector('.app-select-dropdown')).not.toBeInTheDocument()

    fireEvent.mouseDown(select)
    fireEvent.click(within(document.querySelector('.app-select-dropdown')).getByRole('option', { name: 'Inativo' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: 'inativo' }) }))
  })

  it('usa o texto visível como valor quando a opção não declara value', () => {
    const onChange = vi.fn()
    render(
      <AppSelect value="" onChange={onChange}>
        <option value="">Todos</option>
        <option>Pendente</option>
      </AppSelect>,
    )

    fireEvent.mouseDown(screen.getByRole('combobox'))
    fireEvent.click(within(document.querySelector('.app-select-dropdown')).getByRole('option', { name: 'Pendente' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: 'Pendente' }) }))
  })

  it('pesquisa o texto visível ignorando maiúsculas e acentos', () => {
    render(
      <AppSelect searchable value="" onChange={vi.fn()}>
        <option value="">Selecione</option>
        <option value="deposito">Avaria no Depósito</option>
        <option value="ovos">Ovos vencidos</option>
      </AppSelect>,
    )

    fireEvent.mouseDown(screen.getByRole('combobox'))
    const dropdown = document.querySelector('.app-select-dropdown')
    fireEvent.change(within(dropdown).getByRole('searchbox', { name: 'Procurar' }), { target: { value: 'deposito' } })

    expect(within(dropdown).getByRole('option', { name: 'Avaria no Depósito' })).toBeVisible()
    expect(within(dropdown).queryByRole('option', { name: 'Ovos vencidos' })).not.toBeInTheDocument()
  })

  it('fecha com Escape e ao clicar fora', () => {
    render(
      <AppSelect value="" onChange={vi.fn()}>
        <option value="">Todos</option>
        <option value="ativo">Ativo</option>
      </AppSelect>,
    )

    const select = screen.getByRole('combobox')
    fireEvent.mouseDown(select)
    expect(within(document.querySelector('.app-select-dropdown')).getByRole('option', { name: 'Ativo' })).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.app-select-dropdown')).not.toBeInTheDocument()

    fireEvent.mouseDown(select)
    fireEvent.pointerDown(document.body)
    expect(document.querySelector('.app-select-dropdown')).not.toBeInTheDocument()
  })
})
