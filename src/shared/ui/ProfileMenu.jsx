export function ProfileMenu({ actions, className = '', details = [], email, name }) {
  return (
    <div className={`ui-profile-menu ${className}`.trim()} role="menu" aria-label="Informações do perfil">
      <div className="ui-profile-menu__info"><strong>{name || 'Usuário'}</strong><span>{email || 'E-mail não informado'}</span></div>
      {details.length > 0 && <dl>{details.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value || '-'}</dd></div>)}</dl>}
      {actions && <div className="ui-profile-menu__actions">{actions}</div>}
    </div>
  )
}
