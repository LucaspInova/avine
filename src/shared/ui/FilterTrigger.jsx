import { forwardRef } from 'react'

export const FilterTrigger = forwardRef(function FilterTrigger({ activeFilterCount = 0, controls, isOpen, label = 'Filtrar', onToggle }, ref) {
  const filterAnnouncement = `${activeFilterCount} ${activeFilterCount === 1 ? 'filtro ativo' : 'filtros ativos'}`
  return (
    <button
      ref={ref}
      type="button"
      className={`ui-filter-trigger${isOpen ? ' is-open' : ''}`}
      aria-expanded={isOpen}
      aria-controls={controls}
      onClick={() => onToggle?.(!isOpen)}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
      <span>{label}</span>
      <span className="ui-filter-badge" role="status" aria-label={filterAnnouncement}>{activeFilterCount}</span>
      <span className="ui-filter-trigger__chevron" aria-hidden="true">⌄</span>
    </button>
  )
})
