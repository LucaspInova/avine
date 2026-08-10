import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FilterPopover } from './FilterPopover.jsx'
import { FilterSection } from './FilterSection.jsx'

function ControlledPopover({ onApply = vi.fn(), onClear = vi.fn() }) {
  const [open, setOpen] = useState(false)
  return (
    <FilterPopover activeFilterCount={2} isOpen={open} onToggle={setOpen} onApply={onApply} onClear={onClear}>
      <FilterSection title="Estado" count={1}><label><input type="checkbox" /> Ceará</label></FilterSection>
      <FilterSection title="Cidade" defaultOpen={false}><span>Fortaleza</span></FilterSection>
    </FilterPopover>
  )
}

describe('FilterPopover', () => {
  it('abre com atributos acessíveis, exibe contadores e expande seções', () => {
    render(<ControlledPopover />)
    const trigger = screen.getByRole('button', { name: /Filtrar/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger.getAttribute('aria-controls')).toBe(screen.getByRole('dialog').id)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)

    const city = screen.getByRole('button', { name: 'Cidade' })
    expect(city).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(city)
    expect(city).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Fortaleza')).toBeVisible()
    expect(screen.getByLabelText('1 selecionados')).toBeVisible()
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
