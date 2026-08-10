import { SearchField } from './SearchField.jsx'

export function PageToolbar({ actions, activeFilterCount = 0, children, className = '', search, title }) {
  const filterAnnouncement = `${activeFilterCount} ${activeFilterCount === 1 ? 'filtro ativo' : 'filtros ativos'}`
  return (
    <header className={`ui-page-toolbar ${className}`.trim()}>
      {title && <h1 className="ui-page-toolbar__title">{title}{activeFilterCount > 0 && <span className="ui-filter-badge" role="status" aria-label={filterAnnouncement}>{activeFilterCount}</span>}</h1>}
      <div className="ui-page-toolbar__controls">
        {search && <SearchField {...search} className={`ui-page-toolbar__search ${search.className ?? ''}`.trim()} />}
        {children}
        {actions && <div className="ui-page-toolbar__actions">{actions}</div>}
      </div>
    </header>
  )
}
