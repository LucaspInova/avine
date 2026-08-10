import { useId, useState } from 'react'

export function FilterSection({ children, count = 0, defaultOpen = false, id, isOpen, onToggle, title }) {
  const generatedId = useId()
  const contentId = id ?? `filter-section-${generatedId.replaceAll(':', '')}`
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = isOpen ?? internalOpen
  const selectionAnnouncement = `${count} ${count === 1 ? 'selecionado' : 'selecionados'}`
  const toggle = () => {
    if (isOpen === undefined) setInternalOpen((current) => !current)
    onToggle?.(!open)
  }

  return (
    <section className="ui-filter-section">
      <button type="button" className="ui-filter-section__heading" aria-label={title} aria-expanded={open} aria-controls={contentId} onClick={toggle}>
        <span>{title}</span>
        <span className="ui-filter-section__count" role="status" aria-label={selectionAnnouncement}>{count}</span>
        <span className="ui-filter-section__chevron" aria-hidden="true">⌄</span>
      </button>
      {open && <div className="ui-filter-section__content" id={contentId}>{children}</div>}
    </section>
  )
}
