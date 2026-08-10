import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FilterPopover } from './FilterPopover.jsx'
import { FilterSection } from './FilterSection.jsx'

function ControlledPopover({ onApply = vi.fn(), onClear = vi.fn() }) {
  const [open, setOpen] = useState(false)
  return (
    <FilterPopover activeFilterCount={2} isOpen={open} onToggle={setOpen} onApply={onApply} onClear={onClear}>
      <FilterSection title="Estado" count={1}><label><input type="checkbox" /> Ceará</label></FilterSection>
      <FilterSection title="Cidade"><span>Fortaleza</span></FilterSection>
    </FilterPopover>
  )
}

describe('FilterPopover', () => {
  it('abre com as seções fechadas e reinicia esse estado a cada abertura', () => {
    render(<ControlledPopover />)
    const trigger = screen.getByRole('button', { name: /Filtrar/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger.getAttribute('aria-controls')).toBe(screen.getByRole('dialog').id)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)

    const headings = screen.getAllByRole('button', { name: /^(Estado|Cidade)$/ })
    headings.forEach((heading) => expect(heading).toHaveAttribute('aria-expanded', 'false'))

    fireEvent.click(headings[0])
    expect(headings[0]).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Ceará')).toBeVisible()
    expect(screen.getByLabelText('1 selecionado')).toBeVisible()

    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(trigger)
    screen.getAllByRole('button', { name: /^(Estado|Cidade)$/ }).forEach((heading) => {
      expect(heading).toHaveAttribute('aria-expanded', 'false')
    })
  })

  it('limpa, aplica e fecha ao aplicar', () => {
    const onApply = vi.fn()
    const onClear = vi.fn()
    render(<ControlledPopover onApply={onApply} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: /Filtrar/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(onClear).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar Filtros' }))
    expect(onApply).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('gerencia foco, navegação cíclica e anúncio dos badges', async () => {
    render(<ControlledPopover />)
    const trigger = screen.getByRole('button', { name: /Filtrar/ })
    fireEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Estado' })).toHaveFocus())
    expect(screen.getByRole('status', { name: '2 filtros ativos' })).toBeVisible()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('fecha com Escape e clique fora', () => {
    render(<ControlledPopover />)
    const trigger = screen.getByRole('button', { name: /Filtrar/ })
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
