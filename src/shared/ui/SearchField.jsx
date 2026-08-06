export function SearchField({ className = '', label = 'Buscar', onChange, placeholder = 'Procurar', value, ...props }) {
  return (
    <label className={`ui-search-field ${className}`.trim()}>
      <span className="ui-search-field__icon" aria-hidden="true">⌕</span>
      <span className="ui-visually-hidden">{label}</span>
      <input {...props} type="search" value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value, event)} />
    </label>
  )
}
