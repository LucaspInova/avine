import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { FilterTrigger } from './FilterTrigger.jsx'

const VIEWPORT_GAP = 12

export function FilterPopover({
  activeFilterCount = 0,
  applyLabel = 'Aplicar Filtros',
  children,
  clearLabel = 'Limpar filtros',
  id,
  isOpen,
  label = 'Filtrar',
  onApply,
  onClear,
  onToggle,
}) {
  const generatedId = useId()
  const popoverId = id ?? `filter-popover-${generatedId.replaceAll(':', '')}`
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const [position, setPosition] = useState()

  useLayoutEffect(() => {
    if (!isOpen) return undefined
    const positionPanel = () => {
      const anchor = rootRef.current?.getBoundingClientRect()
      const panel = panelRef.current
      if (!anchor || !panel) return
      const width = Math.min(panel.offsetWidth || 360, window.innerWidth - VIEWPORT_GAP * 2)
      const left = Math.max(VIEWPORT_GAP, Math.min(anchor.right - width, window.innerWidth - width - VIEWPORT_GAP))
      const spaceBelow = window.innerHeight - anchor.bottom - VIEWPORT_GAP
      const openAbove = spaceBelow < 280 && anchor.top > spaceBelow
      setPosition({ left, maxHeight: Math.max(180, openAbove ? anchor.top - VIEWPORT_GAP * 2 : spaceBelow), top: openAbove ? undefined : anchor.bottom + 8, bottom: openAbove ? window.innerHeight - anchor.top + 8 : undefined, width })
    }
    positionPanel()
    window.addEventListener('resize', positionPanel)
    window.addEventListener('scroll', positionPanel, true)
    return () => {
      window.removeEventListener('resize', positionPanel)
      window.removeEventListener('scroll', positionPanel, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) onToggle?.(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onToggle?.(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isOpen, onToggle])

  return (
    <div className="ui-filter-popover" ref={rootRef}>
      <FilterTrigger activeFilterCount={activeFilterCount} controls={popoverId} isOpen={isOpen} label={label} onToggle={onToggle} />
      {isOpen && (
        <div className="ui-filter-popover__panel" id={popoverId} ref={panelRef} style={position} role="dialog" aria-label="Filtros">
          {activeFilterCount > 0 && <span className="ui-filter-popover__summary">{activeFilterCount} filtros ativos</span>}
          <div className="ui-filter-popover__sections">{children}</div>
          <footer className="ui-filter-popover__footer">
            <button type="button" className="ui-filter-popover__clear" onClick={onClear}>{clearLabel}</button>
            <button type="button" className="ui-button ui-button--primary" onClick={() => { onApply?.(); onToggle?.(false) }}>{applyLabel}</button>
          </footer>
        </div>
      )}
    </div>
  )
}
