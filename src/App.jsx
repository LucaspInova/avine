import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'

const estados = ['CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL']
const perfis = ['Promotor', 'Entregador']
const emptyPromotorSlots = [1, 2, 3]

const navItems = [
  { id: 'relatorio', label: 'Relatorio', icon: 'chart' },
  { id: 'notas', label: 'Notas', icon: 'notes' },
  { id: 'usuarios', label: 'Usuarios', icon: 'users' },
  { id: 'lojas', label: 'Lojas', icon: 'pin' },
  { id: 'fotos', label: 'Fotos', icon: 'camera' },
  { id: 'logs', label: 'Logs de Erro', icon: 'logs', separated: true },
]

const initialUserForm = {
  email: '',
  nome: '',
  perfil: '',
  estado: '',
  fotos_habilitadas: false,
}

const initialLojaForm = {
  codigo: '',
  nome: '',
  uf: '',
  cidade: '',
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizaNome(nome) {
  return nome.trim().replace(/\s+/g, ' ').toUpperCase()
}

function normalizaTexto(texto) {
  return texto.trim().replace(/\s+/g, ' ')
}

function isNomeDuplicado(nome, usuarios, ignoredId = '') {
  const nomeNormalizado = normalizaNome(nome)

  if (!nomeNormalizado) return false

  return usuarios.some(
    (usuario) => usuario.id !== ignoredId && normalizaNome(usuario.nome) === nomeNormalizado,
  )
}

function isCodigoDuplicado(codigo, lojas) {
  const codigoNormalizado = normalizaTexto(codigo)

  if (!codigoNormalizado) return false

  return lojas.some((loja) => loja.codigo.toLowerCase() === codigoNormalizado.toLowerCase())
}

function Icon({ name, className = '' }) {
  const props = {
    className: `icon ${className}`.trim(),
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }

  if (name === 'chart') {
    return (
      <svg {...props}>
        <path d="M4 19h16" />
        <path d="M7 15v-3" />
        <path d="M12 15V8" />
        <path d="M17 15V5" />
      </svg>
    )
  }

  if (name === 'notes') {
    return (
      <svg {...props}>
        <path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path d="M15 3v5h5" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    )
  }

  if (name === 'users') {
    return (
      <svg {...props}>
        <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </svg>
    )
  }

  if (name === 'pin') {
    return (
      <svg {...props}>
        <path d="M12 22s7-5.2 7-12A7 7 0 0 0 5 10c0 6.8 7 12 7 12Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    )
  }

  if (name === 'camera') {
    return (
      <svg {...props}>
        <path d="M4 8h3l1.6-2h6.8L17 8h3v11H4Z" />
        <circle cx="12" cy="13.5" r="3" />
      </svg>
    )
  }

  if (name === 'logs') {
    return (
      <svg {...props}>
        <path d="M7 4v15" />
        <path d="M4 16l3 3 3-3" />
        <path d="M17 20V5" />
        <path d="M14 8l3-3 3 3" />
      </svg>
    )
  }

  if (name === 'search') {
    return (
      <svg {...props}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
    )
  }

  if (name === 'filter') {
    return (
      <svg {...props}>
        <path d="M4 6h16" />
        <path d="M7 12h10" />
        <path d="M10 18h4" />
      </svg>
    )
  }

  if (name === 'plus') {
    return (
      <svg {...props}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    )
  }

  if (name === 'mail') {
    return (
      <svg {...props}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 7 9-7" />
      </svg>
    )
  }

  if (name === 'gear') {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.8 1.8 0 0 0-2 .1 1.8 1.8 0 0 0-.9 1.6V22H10v-.2a1.8 1.8 0 0 0-.9-1.6 1.8 1.8 0 0 0-2-.1l-.2.1-2-3.4.1-.1a1.7 1.7 0 0 0 .3-1.9 1.8 1.8 0 0 0-1.5-1H3v-4h.8a1.8 1.8 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1a1.8 1.8 0 0 0 2-.1A1.8 1.8 0 0 0 10 2h4v.2a1.8 1.8 0 0 0 .9 1.6 1.8 1.8 0 0 0 2 .1l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9 1.8 1.8 0 0 0 1.5 1h.8v4h-.8a1.8 1.8 0 0 0-1.5 1Z" />
      </svg>
    )
  }

  if (name === 'alert') {
    return (
      <svg {...props}>
        <path d="M12 3 2 21h20L12 3Z" />
        <path d="M12 9v5" />
        <path d="M12 17h.01" />
      </svg>
    )
  }

  if (name === 'check') {
    return (
      <svg {...props}>
        <path d="m5 12 4 4L19 6" />
      </svg>
    )
  }

  if (name === 'edit') {
    return (
      <svg {...props}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    )
  }

  if (name === 'arrow-left') {
    return (
      <svg {...props}>
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
    )
  }

  if (name === 'x') {
    return (
      <svg {...props}>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    )
  }

  return null
}

function Sidebar({ expanded, selectedItem, onToggle, onSelect }) {
  return (
    <aside className={`sidebar ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      <div className="sidebar-brand">
        <button className="brand-button" type="button" aria-label="Avine Gerencial">
          <span className="brand-mark">av</span>
        </button>

        <button
          className="sidebar-toggle"
          type="button"
          onClick={onToggle}
          aria-label={expanded ? 'Recolher sidebar' : 'Expandir sidebar'}
        >
          <span className="sidebar-toggle-chevron" />
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Menu principal">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={[
              'sidebar-item',
              selectedItem === item.id ? 'is-active' : '',
              item.separated ? 'is-separated' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            type="button"
            onClick={() => onSelect(item.id)}
            title={item.label}
          >
            <Icon name={item.icon} />
            <span className="sidebar-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-user">
        <span className="user-orb">A</span>
        <span className="sidebar-label">ARLISSON</span>
      </div>
    </aside>
  )
}

function PhotoSwitch({ checked, disabled = false, onChange, label }) {
  return (
    <button
      className={`photo-switch ${checked ? 'is-on' : ''}`}
      type="button"
      aria-label={label}
      aria-pressed={checked}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onChange?.()
      }}
    >
      <span />
    </button>
  )
}

function CadastroModal({ form, usuarios, busy, error, onChange, onClose, onSubmit }) {
  const trimmedEmail = form.email.trim()
  const trimmedName = form.nome.trim()
  const hasEmailInput = trimmedEmail.length > 0
  const isEmailValid = emailPattern.test(trimmedEmail)
  const isEmailInvalid = hasEmailInput && !isEmailValid
  const isNameValid = trimmedName.length >= 4
  const hasNomeDuplicado = isNomeDuplicado(trimmedName, usuarios)
  const isProfileValid = perfis.includes(form.perfil)
  const isEstadoValid = estados.includes(form.estado)
  const canSubmit =
    isEmailValid && isNameValid && !hasNomeDuplicado && isProfileValid && isEstadoValid && !busy

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="user-modal" onSubmit={onSubmit}>
        <div className="modal-titlebar">
          <h3>Cadastro de Usuario</h3>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar cadastro">
            <Icon name="x" />
          </button>
        </div>

        <div className="modal-grid">
          <div className="modal-main">
            <label className="form-row">
              <span>E-mail</span>
              <input
                className={isEmailInvalid ? 'is-invalid' : ''}
                value={form.email}
                onChange={(event) => onChange({ email: event.target.value })}
                placeholder="Ex: test@gmail.com"
                type="text"
                required
              />
              {isEmailInvalid && (
                <strong className="field-error">Insira um endereco de e-mail valido.</strong>
              )}
            </label>

            <label className="form-row">
              <span>Nome de Usuario</span>
              <input
                value={form.nome}
                onChange={(event) => onChange({ nome: event.target.value })}
                minLength={4}
                type="text"
                required
              />
              {hasNomeDuplicado && (
                <strong className="field-error">Informe o sobrenome para diferenciar este usuario.</strong>
              )}
            </label>

            <div className="form-inline">
              <fieldset>
                <legend>Perfil de Acesso</legend>
                <div className="chip-group">
                  {perfis.map((perfil) => (
                    <button
                      key={perfil}
                      className={`choice-chip ${form.perfil === perfil ? 'is-selected' : ''}`}
                      type="button"
                      onClick={() => onChange({ perfil: form.perfil === perfil ? '' : perfil })}
                    >
                      {perfil}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="switch-field">
                <span>Habilitar Fotos?</span>
                <PhotoSwitch
                  checked={form.fotos_habilitadas}
                  label="Habilitar fotos"
                  onChange={() => onChange({ fotos_habilitadas: !form.fotos_habilitadas })}
                />
              </label>
            </div>

            <fieldset>
              <legend>Estado</legend>
              <div className="chip-group state-chips">
                {estados.map((estado) => (
                  <button
                    key={estado}
                    className={`choice-chip ${form.estado === estado ? 'is-selected' : ''}`}
                    type="button"
                    onClick={() => onChange({ estado: form.estado === estado ? '' : estado })}
                  >
                    {estado}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="modal-hints" aria-hidden="true">
            <span className={isEmailInvalid ? 'is-danger' : isEmailValid ? 'is-success' : ''}>
              <Icon name={isEmailInvalid ? 'alert' : isEmailValid ? 'check' : 'mail'} />
              {isEmailInvalid ? 'Preencha um e-mail valido!' : isEmailValid ? 'E-mail valido' : 'Preencha o E-mail'}
            </span>
            <span className={isNameValid && !hasNomeDuplicado ? 'is-success' : hasNomeDuplicado ? 'is-danger' : ''}>
              <Icon name={isNameValid && !hasNomeDuplicado ? 'check' : hasNomeDuplicado ? 'alert' : 'users'} />
              {hasNomeDuplicado
                ? 'Informe o sobrenome para diferenciar este usuario.'
                : isNameValid
                  ? 'Nome valido'
                  : 'Preencha o nome do usuario'}
            </span>
            <span className={isProfileValid ? 'is-success' : ''}>
              <Icon name={isProfileValid ? 'check' : 'gear'} />
              {isProfileValid ? 'Perfil de acesso escolhido' : 'Escolha o perfil de acesso'}
            </span>
            <span className={isEstadoValid ? 'is-success' : ''}>
              <Icon name={isEstadoValid ? 'check' : 'pin'} />
              {isEstadoValid ? 'Estado escolhido' : 'Preencha a UF'}
            </span>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="modal-submit" type="submit" disabled={!canSubmit}>
          <Icon name="plus" />
          <span>{busy ? 'Cadastrando...' : 'Cadastrar'}</span>
        </button>
      </form>
    </div>
  )
}

function CadastroLojaModal({ form, lojas, busy, error, onChange, onClose, onSubmit }) {
  const codigo = normalizaTexto(form.codigo)
  const nome = normalizaTexto(form.nome)
  const cidade = normalizaTexto(form.cidade)
  const isCodigoValid = codigo.length > 0 && !isCodigoDuplicado(codigo, lojas)
  const isNomeValid = nome.length > 0
  const isUfValid = estados.includes(form.uf)
  const isCidadeValid = cidade.length > 0
  const canSubmit = isCodigoValid && isNomeValid && isUfValid && isCidadeValid && !busy

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="store-modal" onSubmit={onSubmit}>
        <div className="modal-titlebar">
          <h3>Cadastrar Loja</h3>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar cadastro">
            <Icon name="x" />
          </button>
        </div>

        <div className="store-modal-grid">
          <div className="store-modal-main">
            <label className="form-row">
              <span>Codigo da Loja</span>
              <input
                className={form.codigo && !isCodigoValid ? 'is-invalid' : ''}
                value={form.codigo}
                onChange={(event) => onChange({ codigo: event.target.value })}
                type="text"
                required
              />
              {form.codigo && isCodigoDuplicado(codigo, lojas) && (
                <strong className="field-error">Este codigo ja esta cadastrado.</strong>
              )}
            </label>

            <label className="form-row">
              <span>Nome da Loja</span>
              <input
                value={form.nome}
                onChange={(event) => onChange({ nome: event.target.value })}
                type="text"
                required
              />
            </label>

            <fieldset>
              <legend>UF Estado</legend>
              <div className="chip-group state-chips">
                {estados.map((estado) => (
                  <button
                    key={estado}
                    className={`choice-chip ${form.uf === estado ? 'is-selected' : ''}`}
                    type="button"
                    onClick={() => onChange({ uf: form.uf === estado ? '' : estado })}
                  >
                    {estado}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="form-row">
              <span>Cidade</span>
              <input
                value={form.cidade}
                onChange={(event) => onChange({ cidade: event.target.value })}
                type="text"
                required
              />
            </label>
          </div>

          <div className="store-modal-hints" aria-hidden="true">
            <span className={isCodigoValid ? 'is-success' : form.codigo ? 'is-danger' : ''}>
              <Icon name={isCodigoValid ? 'check' : form.codigo ? 'alert' : 'filter'} />
              {isCodigoValid ? 'Codigo valido' : 'Preencha o codigo da loja'}
            </span>
            <span className={isNomeValid ? 'is-success' : ''}>
              <Icon name={isNomeValid ? 'check' : 'notes'} />
              {isNomeValid ? 'Nome preenchido' : 'Preencha o nome da loja'}
            </span>
            <span className={isUfValid ? 'is-success' : ''}>
              <Icon name={isUfValid ? 'check' : 'pin'} />
              {isUfValid ? 'Estado escolhido' : 'Preencha o estado da loja'}
            </span>
            <span className={isCidadeValid ? 'is-success' : ''}>
              <Icon name={isCidadeValid ? 'check' : 'pin'} />
              {isCidadeValid ? 'Cidade preenchida' : 'Preencha a cidade da loja'}
            </span>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="modal-submit" type="submit" disabled={!canSubmit}>
          <Icon name="plus" />
          <span>{busy ? 'Cadastrando...' : 'Cadastrar'}</span>
        </button>
      </form>
    </div>
  )
}

function InformacoesUsuarioModal({ usuario, onClose, onEdit, onTogglePhotos, photoBusy }) {
  if (!usuario) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="info-modal">
        <div className="modal-titlebar">
          <h3>Informacoes do Usuario</h3>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar informacoes">
            <Icon name="x" />
          </button>
        </div>

        <div className="info-hero">
          <button className="info-person" type="button" onClick={onEdit}>
            <span className="info-avatar">
              <Icon name="users" />
            </span>
            <span>
              <strong>{usuario.nome}</strong>
              <small>{usuario.email}</small>
            </span>
            <span className="info-edit-orb">
              <Icon name="edit" />
            </span>
          </button>

          <div className="info-toggle">
            <span>Habilitar fotos</span>
            <PhotoSwitch
              checked={usuario.fotos_habilitadas}
              disabled={photoBusy}
              label="Fotos habilitadas"
              onChange={() => onTogglePhotos(usuario)}
            />
          </div>

          <dl className="info-data">
            <div>
              <dt>Perfil de Acesso</dt>
              <dd>{usuario.perfil}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{usuario.estado}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

function EditarUsuarioModal({
  form,
  usuarios,
  usuarioId,
  busy,
  deleting,
  error,
  onChange,
  onBack,
  onClose,
  onSubmit,
  onDelete,
}) {
  const trimmedEmail = form.email.trim()
  const trimmedName = form.nome.trim()
  const isEmailValid = emailPattern.test(trimmedEmail)
  const isNameValid = trimmedName.length >= 4
  const hasNomeDuplicado = isNomeDuplicado(trimmedName, usuarios, usuarioId)
  const isProfileValid = perfis.includes(form.perfil)
  const isEstadoValid = estados.includes(form.estado)
  const canSubmit =
    isEmailValid && isNameValid && !hasNomeDuplicado && isProfileValid && isEstadoValid && !busy && !deleting

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="edit-modal" onSubmit={onSubmit}>
        <div className="modal-titlebar edit-titlebar">
          <button className="back-button" type="button" onClick={onBack} aria-label="Voltar">
            <Icon name="arrow-left" />
          </button>
          <h3>Editar</h3>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar edicao">
            <Icon name="x" />
          </button>
        </div>

        <div className="edit-body">
          <label className="edit-field">
            <span>
              Nome
              <small>Necessario</small>
            </span>
            <input
              value={form.nome}
              onChange={(event) => onChange({ nome: event.target.value })}
              minLength={4}
              type="text"
              required
            />
            {hasNomeDuplicado && (
              <strong className="field-error">Informe o sobrenome para diferenciar este usuario.</strong>
            )}
          </label>

          <label className="edit-field">
            <span>
              E-mail
              <small>Necessario</small>
            </span>
            <input
              className={trimmedEmail && !isEmailValid ? 'is-invalid' : ''}
              value={form.email}
              onChange={(event) => onChange({ email: event.target.value })}
              type="text"
              required
            />
            {trimmedEmail && !isEmailValid && (
              <strong className="field-error">Insira um endereco de e-mail valido.</strong>
            )}
          </label>

          <fieldset className="edit-field">
            <legend>
              Perfil
              <small>Necessario</small>
            </legend>
            <div className="chip-group">
              {perfis.map((perfil) => (
                <button
                  key={perfil}
                  className={`choice-chip ${form.perfil === perfil ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => onChange({ perfil: form.perfil === perfil ? '' : perfil })}
                >
                  {perfil}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="edit-field">
            <legend>
              UF
              <small>Necessario</small>
            </legend>
            <div className="chip-group state-chips">
              {estados.map((estado) => (
                <button
                  key={estado}
                  className={`choice-chip ${form.estado === estado ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => onChange({ estado: form.estado === estado ? '' : estado })}
                >
                  {estado}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="edit-checkbox">
            <input
              checked={form.fotos_habilitadas}
              onChange={(event) => onChange({ fotos_habilitadas: event.target.checked })}
              type="checkbox"
            />
            <span>Habilitar envio de fotos?</span>
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="edit-actions">
          <button className="primary-button edit-submit" type="submit" disabled={!canSubmit}>
            {busy ? 'Salvando...' : 'Enviar'}
          </button>
          <button className="secondary-button edit-cancel" type="button" onClick={onBack}>
            Cancelar
          </button>
          <button className="danger-button" type="button" onClick={onDelete} disabled={busy || deleting}>
            {deleting ? 'Excluindo...' : 'Excluir usuario'}
          </button>
        </div>
      </form>
    </div>
  )
}

function UserFilterPopover({ selected, onToggle, onClear, onClose }) {
  return (
    <div className="filter-popover">
      <div className="filter-title">
        <strong>Estado</strong>
        <span className="filter-chevron" />
      </div>

      <div className="filter-options">
        {estados.map((estado) => (
          <label key={estado} className="filter-option">
            <span>{estado}</span>
            <input checked={selected.includes(estado)} onChange={() => onToggle(estado)} type="checkbox" />
          </label>
        ))}
      </div>

      <div className="filter-footer">
        <button className="secondary-button" type="button" onClick={onClear}>
          Limpar tudo
        </button>
        <button className="primary-button" type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  )
}

function StoreFilterPopover({
  cidades,
  selectedUfs,
  selectedCidades,
  onToggleUf,
  onToggleCidade,
  onClear,
  onClose,
}) {
  return (
    <div className="filter-popover store-filter-popover">
      <div className="store-filter-columns">
        <div>
          <div className="filter-title">
            <strong>Filtrar por UF</strong>
            <span className="filter-chevron" />
          </div>
          <div className="filter-options">
            {estados.map((estado) => (
              <label key={estado} className="filter-option">
                <span>{estado}</span>
                <input checked={selectedUfs.includes(estado)} onChange={() => onToggleUf(estado)} type="checkbox" />
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="filter-title">
            <strong>Filtrar por Cidade</strong>
            <span className="filter-chevron" />
          </div>
          <div className="filter-options">
            {cidades.map((cidade) => (
              <label key={cidade} className="filter-option">
                <span>{cidade}</span>
                <input
                  checked={selectedCidades.includes(cidade)}
                  onChange={() => onToggleCidade(cidade)}
                  type="checkbox"
                />
              </label>
            ))}
            {cidades.length === 0 && <p className="filter-empty">Nenhuma cidade cadastrada.</p>}
          </div>
        </div>
      </div>

      <div className="filter-footer">
        <button className="secondary-button" type="button" onClick={onClear}>
          Limpar filtros
        </button>
        <button className="primary-button" type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  )
}

function PromotorSelect({ value, promotores, disabled, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selectedPromotor = promotores.find((promotor) => promotor.id === value)
  const filteredPromotores = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return promotores
      .filter((promotor) => !promotor.perfil || promotor.perfil === 'Promotor')
      .filter((promotor) => !normalizedQuery || promotor.nome.toLowerCase().includes(normalizedQuery))
  }, [promotores, query])

  function handleSelect(promotorId) {
    onChange(promotorId)
    setIsOpen(false)
    setQuery('')
  }

  function handleClear(event) {
    event.stopPropagation()
    onChange(null)
    setQuery('')
  }

  return (
    <div
      className={`promotor-select-wrap ${isOpen ? 'is-open' : ''}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false)
          setQuery('')
        }
      }}
    >
      <button
        className="promotor-select-trigger"
        type="button"
        aria-label="Promotor da loja"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{selectedPromotor?.nome ?? '-'}</span>
      </button>
      <button
        className="select-clear"
        type="button"
        aria-label="Remover promotor"
        disabled={disabled || !value}
        onMouseDown={(event) => event.preventDefault()}
        onClick={handleClear}
      >
        <Icon name="x" />
      </button>
      <span className="select-chevron" />

      {isOpen && !disabled && (
        <div className="promotor-dropdown">
          <label className="promotor-search">
            <Icon name="search" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Procurar"
              type="search"
            />
          </label>

          <div className="promotor-options" role="listbox" aria-label="Promotores">
            {filteredPromotores.map((promotor) => (
              <button
                key={promotor.id}
                className={`promotor-option ${promotor.id === value ? 'is-selected' : ''}`}
                type="button"
                role="option"
                aria-selected={promotor.id === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(promotor.id)}
              >
                {promotor.nome}
              </button>
            ))}

            {filteredPromotores.length === 0 && (
              <span className="promotor-empty">Nenhum promotor encontrado.</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function LojasScreen({
  search,
  lojas,
  promotores,
  vinculos,
  loading,
  error,
  savingKey,
  isFilterOpen,
  selectedUfs,
  selectedCidades,
  onSearch,
  onToggleFilter,
  onToggleUf,
  onToggleCidade,
  onClearFilters,
  onCloseFilters,
  onOpenCadastro,
  onChangePromotor,
}) {
  const cidades = useMemo(
    () =>
      [...new Set(lojas.map((loja) => loja.cidade).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [lojas],
  )

  const filteredLojas = useMemo(() => {
    const query = search.trim().toLowerCase()

    return lojas.filter((loja) => {
      const searchText = `${loja.codigo} ${loja.nome} ${loja.cidade} ${loja.uf}`.toLowerCase()
      const matchesSearch = !query || searchText.includes(query)
      const matchesUf = selectedUfs.length === 0 || selectedUfs.includes(loja.uf)
      const matchesCidade =
        selectedCidades.length === 0 || selectedCidades.includes(loja.cidade)

      return matchesSearch && matchesUf && matchesCidade
    })
  }, [lojas, search, selectedCidades, selectedUfs])

  const activeFilterCount = selectedUfs.length + selectedCidades.length
  const activeFilterLabel = activeFilterCount ? `${activeFilterCount} filtros` : 'Filtrar'

  return (
    <section className="stores-page">
      <div className="card-toolbar">
        <h2>Lojas</h2>

        <div className="toolbar-actions">
          <label className="search-field">
            <Icon name="search" />
            <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Procurar" type="search" />
          </label>

          <div className="filter-wrap">
            <button
              className={`filter-trigger ${isFilterOpen ? 'is-open' : ''}`}
              type="button"
              onClick={onToggleFilter}
            >
              <Icon name="filter" />
              <span>{activeFilterLabel}</span>
              <span className="select-chevron" />
            </button>

            {isFilterOpen && (
              <StoreFilterPopover
                cidades={cidades}
                selectedUfs={selectedUfs}
                selectedCidades={selectedCidades}
                onToggleUf={onToggleUf}
                onToggleCidade={onToggleCidade}
                onClear={onClearFilters}
                onClose={onCloseFilters}
              />
            )}
          </div>

          <button className="create-button" type="button" onClick={onOpenCadastro}>
            <Icon name="plus" />
            <span>Cadastrar Loja</span>
          </button>
        </div>
      </div>

      {error && <p className="table-message is-error">{error}</p>}
      {loading && <p className="table-message">Carregando lojas...</p>}

      {!loading && (
        <div className="store-cards-grid" aria-label="Lojas">
          {filteredLojas.map((loja) => {
            const lojaVinculos = vinculos[loja.id] ?? {}

            return (
              <article className="route-store-card" key={loja.id}>
                <span className="store-uf">{loja.uf}</span>
                <strong>{loja.codigo} - {loja.nome}</strong>

                <div className="promotor-slots">
                  {emptyPromotorSlots.map((posicao) => {
                    const key = `${loja.id}-${posicao}`

                    return (
                      <PromotorSelect
                        key={posicao}
                        value={lojaVinculos[posicao] ?? ''}
                        promotores={promotores}
                        disabled={savingKey === key}
                        onChange={(promotorId) => onChangePromotor(loja.id, posicao, promotorId)}
                      />
                    )
                  })}
                </div>
              </article>
            )
          })}

          {filteredLojas.length === 0 && (
            <p className="table-message store-empty-message">Nenhuma loja encontrada.</p>
          )}
        </div>
      )}
    </section>
  )
}

function App() {
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [selectedItem, setSelectedItem] = useState('usuarios')
  const [search, setSearch] = useState('')
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState('')
  const [isCadastroOpen, setCadastroOpen] = useState(false)
  const [isFilterOpen, setFilterOpen] = useState(false)
  const [selectedEstados, setSelectedEstados] = useState([])
  const [form, setForm] = useState(initialUserForm)
  const [selectedUsuario, setSelectedUsuario] = useState(null)
  const [editForm, setEditForm] = useState(initialUserForm)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingUser, setDeletingUser] = useState(false)
  const [isEditOpen, setEditOpen] = useState(false)

  const [lojas, setLojas] = useState([])
  const [promotores, setPromotores] = useState([])
  const [lojaPromotores, setLojaPromotores] = useState([])
  const [lojasLoading, setLojasLoading] = useState(false)
  const [lojasError, setLojasError] = useState('')
  const [storeSavingKey, setStoreSavingKey] = useState('')
  const [lojaForm, setLojaForm] = useState(initialLojaForm)
  const [lojaFormError, setLojaFormError] = useState('')
  const [savingLoja, setSavingLoja] = useState(false)
  const [storeSelectedUfs, setStoreSelectedUfs] = useState([])
  const [storeSelectedCidades, setStoreSelectedCidades] = useState([])

  async function loadUsuarios() {
    setLoading(true)
    setError('')

    const { data, error: requestError } = await supabase
      .from('usuarios')
      .select('id, email, nome, perfil, estado, fotos_habilitadas, created_at')
      .order('nome', { ascending: true })

    if (requestError) {
      setError(requestError.message)
      setUsuarios([])
    } else {
      setUsuarios(data ?? [])
    }

    setLoading(false)
  }

  async function loadLojas() {
    setLojasLoading(true)
    setLojasError('')

    const [lojasResult, promotoresResult, vinculosResult] = await Promise.all([
      supabase
        .from('lojas')
        .select('id, codigo, nome, uf, cidade, created_at')
        .order('codigo', { ascending: true }),
      supabase
        .from('usuarios')
        .select('id, nome, perfil')
        .eq('perfil', 'Promotor')
        .order('nome', { ascending: true }),
      supabase
        .from('loja_promotores')
        .select('id, loja_id, promotor_id, posicao')
        .order('posicao', { ascending: true }),
    ])

    const requestError = lojasResult.error || promotoresResult.error || vinculosResult.error

    if (requestError) {
      setLojasError(requestError.message)
      setLojas([])
      setPromotores([])
      setLojaPromotores([])
    } else {
      setLojas(lojasResult.data ?? [])
      setPromotores(promotoresResult.data ?? [])
      setLojaPromotores(vinculosResult.data ?? [])
    }

    setLojasLoading(false)
  }

  useEffect(() => {
    // Bootstrap client-side data from Supabase when the app opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsuarios()
    loadLojas()
  }, [])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()

    return usuarios.filter((usuario) => {
      const searchText = `${usuario.nome} ${usuario.email} ${usuario.estado} ${usuario.perfil}`.toLowerCase()
      const matchesSearch = !query || searchText.includes(query)
      const matchesEstado = selectedEstados.length === 0 || selectedEstados.includes(usuario.estado)

      return matchesSearch && matchesEstado
    })
  }, [search, selectedEstados, usuarios])

  const vinculosPorLoja = useMemo(() => {
    return lojaPromotores.reduce((acc, vinculo) => {
      if (!acc[vinculo.loja_id]) acc[vinculo.loja_id] = {}
      acc[vinculo.loja_id][vinculo.posicao] = vinculo.promotor_id ?? ''
      return acc
    }, {})
  }, [lojaPromotores])

  const activeFilterLabel = selectedEstados.length ? `${selectedEstados.length} UF` : 'Filtrar'
  const isLojas = selectedItem === 'lojas'
  const isFotos = selectedItem === 'fotos'
  const pageTitle = isLojas ? 'Lojas' : isFotos ? 'Fotos' : 'Cadastro de Usuario'
  const tableTitle = isFotos ? 'Fotos' : 'Usuarios'
  const pageSubtitle = isLojas
    ? 'Roteirizacao dos Promotores.'
    : isFotos
      ? 'Seletor visual das fotos cadastradas por usuario.'
      : 'Lista de cadastro de usuarios (Promotores e Motoristas).'
  const heroIcon = isLojas ? 'pin' : isFotos ? 'camera' : 'users'

  async function handleCreateUsuario(event) {
    event.preventDefault()
    const payload = {
      email: form.email.trim().toLowerCase(),
      nome: form.nome.trim().toUpperCase(),
      perfil: form.perfil,
      estado: form.estado,
      fotos_habilitadas: form.fotos_habilitadas,
    }

    if (
      !emailPattern.test(payload.email) ||
      payload.nome.length < 4 ||
      isNomeDuplicado(payload.nome, usuarios) ||
      !perfis.includes(payload.perfil) ||
      !estados.includes(payload.estado)
    ) {
      setFormError(
        isNomeDuplicado(payload.nome, usuarios)
          ? 'Informe o sobrenome para diferenciar este usuario.'
          : 'Revise os campos obrigatorios antes de cadastrar.',
      )
      return
    }

    setSaving(true)
    setFormError('')

    const { error: insertError } = await supabase.from('usuarios').insert(payload)

    if (insertError) {
      setFormError(
        insertError.code === '23505'
          ? insertError.message.includes('usuarios_nome')
            ? 'Informe o sobrenome para diferenciar este usuario.'
            : 'Este e-mail ja esta cadastrado.'
          : insertError.message,
      )
      setSaving(false)
      return
    }

    setForm(initialUserForm)
    setCadastroOpen(false)
    setSaving(false)
    await loadUsuarios()
    await loadLojas()
  }

  async function handleCreateLoja(event) {
    event.preventDefault()

    const payload = {
      codigo: normalizaTexto(lojaForm.codigo),
      nome: normalizaTexto(lojaForm.nome).toUpperCase(),
      uf: lojaForm.uf,
      cidade: normalizaTexto(lojaForm.cidade),
    }

    if (
      !payload.codigo ||
      isCodigoDuplicado(payload.codigo, lojas) ||
      !payload.nome ||
      !estados.includes(payload.uf) ||
      !payload.cidade
    ) {
      setLojaFormError(
        isCodigoDuplicado(payload.codigo, lojas)
          ? 'Este codigo ja esta cadastrado.'
          : 'Revise os campos obrigatorios antes de cadastrar.',
      )
      return
    }

    setSavingLoja(true)
    setLojaFormError('')

    const { error: insertError } = await supabase.from('lojas').insert(payload)

    if (insertError) {
      setLojaFormError(insertError.code === '23505' ? 'Este codigo ja esta cadastrado.' : insertError.message)
      setSavingLoja(false)
      return
    }

    setLojaForm(initialLojaForm)
    setCadastroOpen(false)
    setSavingLoja(false)
    await loadLojas()
  }

  async function handlePhotoToggle(usuario) {
    const nextValue = !usuario.fotos_habilitadas
    setUpdatingId(usuario.id)
    setError('')

    const { error: updateError } = await supabase
      .from('usuarios')
      .update({ fotos_habilitadas: nextValue })
      .eq('id', usuario.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setUsuarios((current) =>
        current
          .map((item) => (item.id === usuario.id ? { ...item, fotos_habilitadas: nextValue } : item))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      )
      setSelectedUsuario((current) =>
        current?.id === usuario.id ? { ...current, fotos_habilitadas: nextValue } : current,
      )
    }

    setUpdatingId('')
  }

  async function handlePromotorChange(lojaId, posicao, promotorId) {
    const key = `${lojaId}-${posicao}`
    setStoreSavingKey(key)
    setLojasError('')

    if (!promotorId) {
      const { error: deleteError } = await supabase
        .from('loja_promotores')
        .delete()
        .eq('loja_id', lojaId)
        .eq('posicao', posicao)

      if (deleteError) {
        setLojasError(deleteError.message)
      } else {
        setLojaPromotores((current) =>
          current.filter((vinculo) => !(vinculo.loja_id === lojaId && vinculo.posicao === posicao)),
        )
      }

      setStoreSavingKey('')
      return
    }

    const { data, error: upsertError } = await supabase
      .from('loja_promotores')
      .upsert(
        {
          loja_id: lojaId,
          posicao,
          promotor_id: promotorId,
        },
        { onConflict: 'loja_id,posicao' },
      )
      .select('id, loja_id, promotor_id, posicao')
      .single()

    if (upsertError) {
      setLojasError(upsertError.message)
    } else {
      setLojaPromotores((current) => {
        const withoutCurrent = current.filter(
          (vinculo) => !(vinculo.loja_id === lojaId && vinculo.posicao === posicao),
        )
        return [...withoutCurrent, data].sort((a, b) => a.posicao - b.posicao)
      })
    }

    setStoreSavingKey('')
  }

  function openInfoModal(usuario) {
    setSelectedUsuario(usuario)
    setEditError('')
  }

  function openEditModal() {
    if (!selectedUsuario) return

    setEditForm({
      email: selectedUsuario.email,
      nome: selectedUsuario.nome,
      perfil: selectedUsuario.perfil,
      estado: selectedUsuario.estado,
      fotos_habilitadas: selectedUsuario.fotos_habilitadas,
    })
    setEditError('')
    setEditOpen(true)
  }

  function closeUserModals() {
    setSelectedUsuario(null)
    setEditForm(initialUserForm)
    setEditError('')
    setEditOpen(false)
  }

  async function handleEditUsuario(event) {
    event.preventDefault()

    if (!selectedUsuario) return

    const payload = {
      email: editForm.email.trim().toLowerCase(),
      nome: normalizaNome(editForm.nome),
      perfil: editForm.perfil,
      estado: editForm.estado,
      fotos_habilitadas: editForm.fotos_habilitadas,
    }

    if (
      !emailPattern.test(payload.email) ||
      payload.nome.length < 4 ||
      isNomeDuplicado(payload.nome, usuarios, selectedUsuario.id) ||
      !perfis.includes(payload.perfil) ||
      !estados.includes(payload.estado)
    ) {
      setEditError(
        isNomeDuplicado(payload.nome, usuarios, selectedUsuario.id)
          ? 'Informe o sobrenome para diferenciar este usuario.'
          : 'Revise os campos obrigatorios antes de salvar.',
      )
      return
    }

    setSavingEdit(true)
    setEditError('')

    const { error: updateError } = await supabase
      .from('usuarios')
      .update(payload)
      .eq('id', selectedUsuario.id)

    if (updateError) {
      setEditError(
        updateError.code === '23505'
          ? updateError.message.includes('usuarios_nome')
            ? 'Informe o sobrenome para diferenciar este usuario.'
            : 'Este e-mail ja esta cadastrado.'
          : updateError.message,
      )
      setSavingEdit(false)
      return
    }

    setSavingEdit(false)
    closeUserModals()
    await loadUsuarios()
    await loadLojas()
  }

  async function handleDeleteUsuario() {
    if (!selectedUsuario) return

    const shouldDelete = window.confirm(`Excluir usuario ${selectedUsuario.nome}?`)
    if (!shouldDelete) return

    setDeletingUser(true)
    setEditError('')

    const { error: deleteError } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', selectedUsuario.id)

    if (deleteError) {
      setEditError(deleteError.message)
      setDeletingUser(false)
      return
    }

    setDeletingUser(false)
    closeUserModals()
    await loadUsuarios()
    await loadLojas()
  }

  function toggleEstado(estado) {
    setSelectedEstados((current) =>
      current.includes(estado) ? current.filter((item) => item !== estado) : [...current, estado],
    )
  }

  function toggleStoreUf(estado) {
    setStoreSelectedUfs((current) =>
      current.includes(estado) ? current.filter((item) => item !== estado) : [...current, estado],
    )
  }

  function toggleStoreCidade(cidade) {
    setStoreSelectedCidades((current) =>
      current.includes(cidade) ? current.filter((item) => item !== cidade) : [...current, cidade],
    )
  }

  function handleSelectItem(item) {
    setSelectedItem(item)
    setSearch('')
    setFilterOpen(false)
  }

  function closeCadastro() {
    setCadastroOpen(false)
    setFormError('')
    setLojaFormError('')
  }

  return (
    <div className="admin-shell">
      <Sidebar
        expanded={sidebarExpanded}
        selectedItem={selectedItem}
        onSelect={handleSelectItem}
        onToggle={() => setSidebarExpanded((open) => !open)}
      />

      <main className={`workspace ${sidebarExpanded ? 'sidebar-open' : ''}`}>
        <header className="page-hero">
          <div className="page-hero-inner">
            <div className="hero-user-icon">
              <Icon name={heroIcon} />
            </div>
            <div>
              <h1>{pageTitle}</h1>
              <p>{pageSubtitle}</p>
            </div>
          </div>
        </header>

        {isLojas ? (
          <LojasScreen
            search={search}
            lojas={lojas}
            promotores={promotores}
            vinculos={vinculosPorLoja}
            loading={lojasLoading}
            error={lojasError}
            savingKey={storeSavingKey}
            isFilterOpen={isFilterOpen}
            selectedUfs={storeSelectedUfs}
            selectedCidades={storeSelectedCidades}
            onSearch={setSearch}
            onToggleFilter={() => setFilterOpen((open) => !open)}
            onToggleUf={toggleStoreUf}
            onToggleCidade={toggleStoreCidade}
            onClearFilters={() => {
              setStoreSelectedUfs([])
              setStoreSelectedCidades([])
            }}
            onCloseFilters={() => setFilterOpen(false)}
            onOpenCadastro={() => setCadastroOpen(true)}
            onChangePromotor={handlePromotorChange}
          />
        ) : (
          <section className="users-card">
            <div className="card-toolbar">
              <h2>{tableTitle}</h2>

              <div className="toolbar-actions">
                <label className="search-field">
                  <Icon name="search" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Procurar"
                    type="search"
                  />
                </label>

                <div className="filter-wrap">
                  <button
                    className={`filter-trigger ${isFilterOpen ? 'is-open' : ''}`}
                    type="button"
                    onClick={() => setFilterOpen((open) => !open)}
                  >
                    <Icon name="filter" />
                    <span>{activeFilterLabel}</span>
                    <span className="select-chevron" />
                  </button>

                  {isFilterOpen && (
                    <UserFilterPopover
                      selected={selectedEstados}
                      onToggle={toggleEstado}
                      onClear={() => setSelectedEstados([])}
                      onClose={() => setFilterOpen(false)}
                    />
                  )}
                </div>

                <button className="create-button" type="button" onClick={() => setCadastroOpen(true)}>
                  <Icon name="plus" />
                  <span>Cadastrar Usuario</span>
                </button>
              </div>
            </div>

            {error && <p className="table-message is-error">{error}</p>}
            {loading && <p className="table-message">Carregando usuarios...</p>}

            {!loading && (
              <div className="users-table" role="table" aria-label="Usuarios">
                <div className="table-row table-head" role="row">
                  <span role="columnheader">NOME</span>
                  <span role="columnheader">EMAIL</span>
                  <span role="columnheader">PERFIL</span>
                  <span role="columnheader">UF</span>
                  <span role="columnheader">FOTOS</span>
                </div>

                {filteredUsers.map((usuario) => (
                  <div
                    className="table-row"
                    role="row"
                    key={usuario.id}
                    tabIndex={0}
                    onClick={() => openInfoModal(usuario)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') openInfoModal(usuario)
                    }}
                  >
                    <div className="name-cell" role="cell">
                      <span className="avatar-mini">
                        <Icon name="users" />
                      </span>
                      <strong>{usuario.nome}</strong>
                    </div>
                    <span className="email-cell" role="cell">
                      {usuario.email}
                    </span>
                    <span className="profile-pill" role="cell">
                      {usuario.perfil}
                    </span>
                    <span className="uf-cell" role="cell">
                      {usuario.estado}
                    </span>
                    <span className="photos-cell" role="cell">
                      <PhotoSwitch
                        checked={usuario.fotos_habilitadas}
                        disabled={updatingId === usuario.id}
                        label={`Alternar fotos de ${usuario.nome}`}
                        onChange={() => handlePhotoToggle(usuario)}
                      />
                    </span>
                  </div>
                ))}

                {filteredUsers.length === 0 && (
                  <p className="table-message">Nenhum usuario encontrado.</p>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      {isCadastroOpen && !isLojas && (
        <CadastroModal
          form={form}
          usuarios={usuarios}
          busy={saving}
          error={formError}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          onClose={closeCadastro}
          onSubmit={handleCreateUsuario}
        />
      )}

      {isCadastroOpen && isLojas && (
        <CadastroLojaModal
          form={lojaForm}
          lojas={lojas}
          busy={savingLoja}
          error={lojaFormError}
          onChange={(patch) => setLojaForm((current) => ({ ...current, ...patch }))}
          onClose={closeCadastro}
          onSubmit={handleCreateLoja}
        />
      )}

      {selectedUsuario && !isEditOpen && (
        <InformacoesUsuarioModal
          usuario={selectedUsuario}
          onClose={closeUserModals}
          onEdit={openEditModal}
          onTogglePhotos={handlePhotoToggle}
          photoBusy={updatingId === selectedUsuario.id}
        />
      )}

      {selectedUsuario && isEditOpen && (
        <EditarUsuarioModal
          form={editForm}
          usuarios={usuarios}
          usuarioId={selectedUsuario.id}
          busy={savingEdit}
          deleting={deletingUser}
          error={editError}
          onChange={(patch) => setEditForm((current) => ({ ...current, ...patch }))}
          onBack={() => {
            setEditOpen(false)
            setEditError('')
          }}
          onClose={closeUserModals}
          onSubmit={handleEditUsuario}
          onDelete={handleDeleteUsuario}
        />
      )}

    </div>
  )
}

export default App
