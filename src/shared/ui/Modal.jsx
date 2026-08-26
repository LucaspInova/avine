import { useEffect, useId } from 'react'

export function Modal({ children, className = '', footer, isOpen = true, label, layerClassName = '', onClose, title }) {
  const generatedId = useId()
  const titleId = title ? `${generatedId}-title` : undefined

  useEffect(() => {
    if (!isOpen || !onClose) return undefined
    const handleKeyDown = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className={`ui-modal-layer ${layerClassName}`.trim()} role="presentation">
      <button className="ui-modal-backdrop" type="button" aria-label="Fechar modal" onClick={onClose} />
      <section className={`ui-modal ${className}`.trim()} role="dialog" aria-modal="true" aria-label={label} aria-labelledby={titleId}>
        {title && <header className="ui-modal__header"><h2 id={titleId}>{title}</h2></header>}
        <div className="ui-modal__content">{children}</div>
        {footer && <footer className="ui-modal__footer">{footer}</footer>}
      </section>
    </div>
  )
}
