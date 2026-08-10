export function FilterTrigger({ activeFilterCount = 0, controls, isOpen, label = 'Filtrar', onToggle }) {
  return (
    <button
      type="button"
      className={`ui-filter-trigger${isOpen ? ' is-open' : ''}`}
      aria-expanded={isOpen}
      aria-controls={controls}
      onClick={() => onToggle?.(!isOpen)}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
      <span>{label}</span>
      {activeFilterCount > 0 && <span className="ui-filter-badge" aria-label={`${activeFilterCount} filtros ativos`}>{activeFilterCount}</span>}
      <span className="ui-filter-trigger__chevron" aria-hidden="true">⌄</span>
    </button>
  )
}
