function getPages(currentPage, totalPages) {
  const visible = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => page <= 2 || page === totalPages || Math.abs(page - currentPage) <= 1)
  return visible.reduce((items, page) => {
    const last = items.at(-1)
    if (typeof last === 'number' && page - last > 1) items.push(`ellipsis-${last}`)
    items.push(page)
    return items
  }, [])
}

export function Pagination({ className = '', currentPage, label = 'Paginação', onPageChange, totalPages }) {
  if (totalPages <= 1) return null
  return (
    <nav className={`ui-pagination ${className}`.trim()} aria-label={label}>
      <button type="button" aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>&lsaquo;</button>
      {getPages(currentPage, totalPages).map((item) => typeof item === 'string'
        ? <span key={item}>…</span>
        : <button type="button" aria-current={item === currentPage ? 'page' : undefined} className={item === currentPage ? 'is-active' : ''} key={item} onClick={() => onPageChange(item)}>{item}</button>)}
      <button type="button" aria-label="Próxima página" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>&rsaquo;</button>
    </nav>
  )
}
