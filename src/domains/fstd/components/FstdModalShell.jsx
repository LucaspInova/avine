export function FstdModalShell({ children, finalized = false, label = 'Realizar FSTD', onClose }) {
  return (
    <div className="gerencial-fstd-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`gerencial-fstd-modal${finalized ? ' gerencial-finalized-modal' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </section>
    </div>
  )
}
