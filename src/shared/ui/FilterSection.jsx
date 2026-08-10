import { useId, useState } from 'react'

export function FilterSection({ children, count = 0, defaultOpen = true, id, isOpen, onToggle, title }) {
  const generatedId = useId()
  const contentId = id ?? `filter-section-${generatedId.replaceAll(':', '')}`
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = isOpen ?? internalOpen
  const toggle = () => {
    if (isOpen === undefined) setInternalOpen((current) => !current)
    onToggle?.(!open)
  }

  return (
    <section className="ui-filter-section">
      <button type="button" className="ui-filter-section__heading" aria-expanded={open} aria-controls={contentId} onClick={toggle}>
        <span>{title}</span>
        {count > 0 && <span className="ui-filter-section__count" aria-label={`${count} selecionados`}>{count}</span>}
        <span className="ui-filter-section__chevron" aria-hidden="true">⌄</span>
      </button>
      {open && <div className="ui-filter-section__content" id={contentId}>{children}</div>}
    </section>
  )
}
