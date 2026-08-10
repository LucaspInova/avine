export function SearchField({ className = '', label = 'Buscar', onChange, placeholder = 'Procurar', value, ...props }) {
  return (
    <label className={`ui-search-field ${className}`.trim()}>
      <svg className="ui-search-field__icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
      <span className="ui-visually-hidden">{label}</span>
      <input {...props} type="search" value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value, event)} />
    </label>
  )
}
