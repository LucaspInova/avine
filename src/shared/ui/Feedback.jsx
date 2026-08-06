export function EmptyState({ children, className = '', icon = '♡' }) {
  return <div className={`ui-state ui-state--empty ${className}`.trim()}><span aria-hidden="true">{icon}</span><strong>{children}</strong></div>
}

export function LoadingState({ children = 'Carregando...', className = '' }) {
  return <div className={`ui-state ui-state--loading ${className}`.trim()} role="status" aria-live="polite"><span className="ui-spinner" aria-hidden="true" />{children}</div>
}

export function ErrorMessage({ children, className = '' }) {
  if (!children) return null
  return <p className={`ui-error-message ${className}`.trim()} role="alert">{children}</p>
}
