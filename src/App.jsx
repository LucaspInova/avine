import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import { createGerencialUser, createOperationalUser } from './lib/gerencialUsers'
import {
  getProfilePhotoSignedUrl,
  uploadProfilePhoto,
  validateProfilePhoto,
} from './lib/profilePhoto'
import avineLogo from './assets/foto_logoavine.png'
import './App.css'

const estados = ['CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL']
const perfis = ['Promotor', 'Entregador']
const emptyPromotorSlots = [1, 2, 3]

const navItems = [
  { id: 'relatorios', label: 'Relatório', icon: 'chart' },
  { id: 'notas', label: 'Notas', icon: 'notes' },
  { id: 'usuarios', label: 'Usuários', icon: 'users' },
  { id: 'lojas', label: 'Lojas', icon: 'pin' },
]

const initialUserForm = {
  email: '',
  nome: '',
  senha: '',
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

const initialGerencialForm = {
  nome: '',
  email: '',
  senha: '',
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const usuarioSelect = 'id, auth_user_id, email, nome, perfil, estado, fotos_habilitadas, foto_url, ativo, created_at'
const mockNotasGroups = [
  {
    date: '18/6/2026',
    pages: 15,
    rows: [
      { loja: 'SPAZIO OLH', nfd: '1509', status: 'Pendente' },
      { loja: 'MAT SUPER MA', nfd: '163614', status: 'Pendente' },
      { loja: 'MAT BELEM 2', nfd: '166702', status: 'Pendente' },
      { loja: 'MAT. ACAILAN', nfd: '67826', status: 'Pendente' },
      { loja: 'MAT CANINDE', nfd: '22918', status: 'Pendente' },
      { loja: 'MAT JK', nfd: '1977', status: 'Pendente' },
      { loja: 'REDE MENOR 1', nfd: '97480', status: 'Pendente' },
      { loja: 'MAT ZEQUIN', nfd: '105253', status: 'Pendente' },
      { loja: 'MAT CRATEUS', nfd: '21171', status: 'FSTD' },
      { loja: 'LIDER MARABA', nfd: '218115', status: 'Pendente' },
    ],
  },
  {
    date: '17/6/2026',
    pages: 15,
    rows: [
      { loja: 'MAT ITAPIPOC', nfd: '39913', status: 'FSTD' },
      { loja: 'SENDAS BATIS', nfd: '123186', status: 'Pendente' },
      { loja: 'NORDESTAO 03', nfd: '117142', status: 'Pendente' },
      { loja: 'MAXXI PI JOA', nfd: '53574', status: 'FSTD' },
      { loja: 'VANGU JOAQUI', nfd: '45485', status: 'FSTD' },
      { loja: 'MAT JARDIM R', nfd: '258733', status: 'FSTD' },
      { loja: 'EVANDRO 05', nfd: '61202', status: 'FSTD' },
      { loja: 'MAT CAJAZEIR', nfd: '175184', status: 'Pendente' },
      { loja: 'MAT JARDIM R', nfd: '258737', status: 'FSTD' },
      { loja: 'ATAC PALMARE', nfd: '44561', status: 'Pendente' },
    ],
  },
  {
    date: '16/6/2026',
    pages: 18,
    rows: [
      { loja: 'SODEXO JABOA', nfd: '126651', status: 'Pendente' },
      { loja: 'MAT ARACAJU', nfd: '61608', status: 'FSTD' },
      { loja: 'MERC PIRAJA', nfd: '91736', status: 'Pendente' },
      { loja: 'MAT FOOD', nfd: '9181', status: 'FSTD' },
      { loja: 'CARONE MAIOB', nfd: '19495', status: 'FSTD' },
      { loja: 'MAT CAXIAS 2', nfd: '1509', status: 'FSTD' },
      { loja: 'MAT PORTO SE', nfd: '40522', status: 'FSTD' },
      { loja: 'MAIS BARA 03', nfd: '85990', status: 'Pendente' },
      { loja: 'ATAC PALMARE', nfd: '44530', status: 'FSTD' },
      { loja: 'SUPER MAX 2', nfd: '7100', status: 'Pendente' },
    ],
  },
]

function normalizaNome(nome) {
  return nome.trim().replace(/\s+/g, ' ').toUpperCase()
}

function normalizaTexto(texto) {
  return texto.trim().replace(/\s+/g, ' ')
}

function normalizaUf(uf) {
  return (uf ?? '').trim().toUpperCase()
}

function isMesmoUf(loja, promotor) {
  return normalizaUf(loja?.uf) === normalizaUf(promotor?.estado)
}

async function fetchAllNfdNotas(select, configureQuery) {
  const pageSize = 1000
  const rows = []

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from('nfd_notas').select(select)
    query = configureQuery ? configureQuery(query) : query

    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) return { data: [], error }

    rows.push(...(data ?? []))
    if ((data ?? []).length < pageSize) break
  }

  return { data: rows, error: null }
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

  if (name === 'logout') {
    return (
      <svg {...props}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
    )
  }

  return null
}

function Sidebar({ expanded, selectedItem, currentUser, profilePhoto, onLogout, onToggle, onSelect }) {
  const firstName = currentUser?.nome?.split(/\s+/).filter(Boolean)[0] ?? 'Avine'
  const initials = currentUser?.nome
    ? currentUser.nome
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
    : 'AV'

  return (
    <aside className={`sidebar ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      <div className="sidebar-brand">
        <button className="brand-button" type="button" aria-label="Avine Gerencial">
          <img className="brand-logo" src={avineLogo} alt="Avine" />
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
        <button className="profile-trigger" type="button" aria-haspopup="menu">
          <span className="user-orb">
            {profilePhoto ? <img src={profilePhoto} alt="" /> : initials}
          </span>
          <span className="profile-first-name">{firstName}</span>
        </button>
        <div className="profile-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => onSelect('perfil')}>Ver perfil</button>
          <button type="button" role="menuitem" onClick={onLogout}>Sair</button>
        </div>
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
  const password = form.senha
  const hasEmailInput = trimmedEmail.length > 0
  const isEmailValid = emailPattern.test(trimmedEmail)
  const isEmailInvalid = hasEmailInput && !isEmailValid
  const isNameValid = trimmedName.length >= 4
  const isPasswordValid = password.length >= 8
  const hasNomeDuplicado = isNomeDuplicado(trimmedName, usuarios)
  const isProfileValid = perfis.includes(form.perfil)
  const isEstadoValid = estados.includes(form.estado)
  const canSubmit =
    isEmailValid &&
    isNameValid &&
    isPasswordValid &&
    !hasNomeDuplicado &&
    isProfileValid &&
    isEstadoValid &&
    !busy

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="user-modal" onSubmit={onSubmit}>
        <div className="modal-titlebar">
          <h3>Cadastro de Usuário</h3>
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
                <strong className="field-error">Insira um endereço de e-mail válido.</strong>
              )}
            </label>

            <label className="form-row">
              <span>Nome de Usuário</span>
              <input
                value={form.nome}
                onChange={(event) => onChange({ nome: event.target.value })}
                minLength={4}
                type="text"
                required
              />
              {hasNomeDuplicado && (
                <strong className="field-error">Informe o sobrenome para diferenciar este usuário.</strong>
              )}
            </label>

            <label className="form-row">
              <span>Senha</span>
              <input
                className={password && !isPasswordValid ? 'is-invalid' : ''}
                value={password}
                onChange={(event) => onChange({ senha: event.target.value })}
                minLength={8}
                type="password"
                autoComplete="new-password"
                required
              />
              {password && !isPasswordValid && (
                <strong className="field-error">A senha deve ter pelo menos 8 caracteres.</strong>
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
              {isEmailInvalid ? 'Preencha um e-mail válido!' : isEmailValid ? 'E-mail válido' : 'Preencha o e-mail'}
            </span>
            <span className={isNameValid && !hasNomeDuplicado ? 'is-success' : hasNomeDuplicado ? 'is-danger' : ''}>
              <Icon name={isNameValid && !hasNomeDuplicado ? 'check' : hasNomeDuplicado ? 'alert' : 'users'} />
              {hasNomeDuplicado
                ? 'Informe o sobrenome para diferenciar este usuário.'
                : isNameValid
                  ? 'Nome válido'
                  : 'Preencha o nome do usuário'}
            </span>
            <span className={isPasswordValid ? 'is-success' : password ? 'is-danger' : ''}>
              <Icon name={isPasswordValid ? 'check' : password ? 'alert' : 'gear'} />
              {isPasswordValid ? 'Senha válida' : 'Senha mínima de 8 caracteres'}
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
              <span>Código da Loja</span>
              <input
                className={form.codigo && !isCodigoValid ? 'is-invalid' : ''}
                value={form.codigo}
                onChange={(event) => onChange({ codigo: event.target.value })}
                type="text"
                required
              />
              {form.codigo && isCodigoDuplicado(codigo, lojas) && (
                <strong className="field-error">Este código já está cadastrado.</strong>
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
              {isCodigoValid ? 'Código válido' : 'Preencha o código da loja'}
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
          <h3>Informações do Usuário</h3>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar informações">
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
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar edição">
            <Icon name="x" />
          </button>
        </div>

        <div className="edit-body">
          <label className="edit-field">
            <span>
              Nome
              <small>Necessário</small>
            </span>
            <input
              value={form.nome}
              onChange={(event) => onChange({ nome: event.target.value })}
              minLength={4}
              type="text"
              required
            />
            {hasNomeDuplicado && (
              <strong className="field-error">Informe o sobrenome para diferenciar este usuário.</strong>
            )}
          </label>

          <label className="edit-field">
            <span>
              E-mail
              <small>Necessário</small>
            </span>
            <input
              className={trimmedEmail && !isEmailValid ? 'is-invalid' : ''}
              value={form.email}
              onChange={(event) => onChange({ email: event.target.value })}
              type="text"
              required
            />
            {trimmedEmail && !isEmailValid && (
              <strong className="field-error">Insira um endereço de e-mail válido.</strong>
            )}
          </label>

          <fieldset className="edit-field">
            <legend>
              Perfil
              <small>Necessário</small>
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
              <small>Necessário</small>
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
            {deleting ? 'Excluindo...' : 'Excluir usuário'}
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

  const [currentPage, setCurrentPage] = useState(1)
  const storesPerPage = 24
  const totalPages = Math.max(1, Math.ceil(filteredLojas.length / storesPerPage))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedLojas = filteredLojas.slice((safePage - 1) * storesPerPage, safePage * storesPerPage)


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
          {paginatedLojas.map((loja) => {
            const lojaVinculos = vinculos[loja.id] ?? {}
            const promotoresDaUf = promotores.filter((promotor) => isMesmoUf(loja, promotor))

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
                        promotores={promotoresDaUf}
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

      {!loading && filteredLojas.length > storesPerPage && (
        <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} />
      )}
    </section>
  )
}

function Pagination({ currentPage, totalPages, onPageChange }) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)
  const visiblePages = pages.filter((page) => page <= 5 || page === totalPages || Math.abs(page - currentPage) <= 1)
  const items = visiblePages.reduce((acc, page) => {
    const last = acc[acc.length - 1]
    if (last && page - last > 1) acc.push('ellipsis')
    acc.push(page)
    return acc
  }, [])

  return (
    <nav className="pagination" aria-label="Paginação de lojas">
      <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>&lsaquo;</button>
      {items.map((item, index) =>
        item === 'ellipsis' ? (
          <span key={`ellipsis-${index}`}>...</span>
        ) : (
          <button
            key={item}
            className={item === currentPage ? 'is-active' : ''}
            type="button"
            onClick={() => onPageChange(item)}
          >
            {item}
          </button>
        ),
      )}
      <button type="button" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>&rsaquo;</button>
    </nav>
  )
}

function PerfilScreen({ user, profilePhoto, onSave }) {
  const [isOpen, setOpen] = useState(false)
  const [name, setName] = useState(user?.nome ?? '')
  const [photoPreview, setPhotoPreview] = useState(profilePhoto)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const validationError = validateProfilePhoto(file)
    if (validationError) {
      setSaveError(validationError)
      event.target.value = ''
      return
    }

    setSaveError('')
    setSelectedPhoto(file)

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoPreview(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setSaveError('')

    try {
      await onSave(name, selectedPhoto)
      setOpen(false)
      setSelectedPhoto(null)
    } catch (saveProfileError) {
      setSaveError(saveProfileError instanceof Error ? saveProfileError.message : 'Não foi possível salvar o perfil.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="profile-page">
      <div className="profile-card">
        <div className="profile-cover" />
        <div className="profile-details">
          <div className="profile-photo">{profilePhoto ? <img src={profilePhoto} alt="Foto de perfil" /> : (user?.nome?.[0] ?? 'A')}</div>
          <div>
            <h2>{user?.nome}</h2>
            <p>{user?.email}</p>
          </div>
          <button className="create-button profile-edit-button" type="button" onClick={() => { setName(user?.nome ?? ''); setPhotoPreview(profilePhoto); setSelectedPhoto(null); setSaveError(''); setOpen(true) }}>
            <Icon name="gear" />
            <span>Editar Perfil</span>
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="profile-drawer-backdrop">
          <form className="profile-drawer" onSubmit={handleSubmit}>
            <div className="modal-titlebar">
              <h3>Editar</h3>
              <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Fechar">
                <Icon name="x" />
              </button>
            </div>
            <div className="profile-edit-box">
              <strong>{user?.email}</strong>
              <label className="edit-field">
                <span>Nome</span>
                <input value={name} onChange={(event) => setName(event.target.value)} type="text" minLength={4} required />
              </label>
              <label className="edit-field profile-photo-field">
                <span>Foto</span>
                <div className="profile-file-control">
                  <Icon name="camera" />
                  <span>{selectedPhoto?.name ?? 'Escolha uma imagem...'}</span>
                </div>
                <input className="profile-file-input" onChange={handleFile} type="file" accept="image/jpeg,image/png,image/webp" />
              </label>
              {photoPreview && <img className="profile-preview" src={photoPreview} alt="Prévia" />}
            </div>
            {saveError && <p className="form-error">{saveError}</p>}
            <div className="edit-actions">
              <button className="primary-button edit-submit" type="submit" disabled={saving}>
                {saving ? 'Enviando...' : 'Enviar'}
              </button>
              <button className="secondary-button edit-cancel" type="button" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

function LoginScreen({ error, busy, title = 'Painel Gerencial', onSubmit }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const canSubmit = emailPattern.test(email.trim()) && senha.length > 0 && !busy

  return (
    <main className="login-shell">
      <form
        className="login-panel"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit({ email: email.trim().toLowerCase(), password: senha })
        }}
      >
        <img className="login-logo" src={avineLogo} alt="Avine" />
        <h1>{title}</h1>

        <label className="login-field">
          <span>E-mail</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            required
          />
        </label>

        <label className="login-field">
          <span>Senha</span>
          <input
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="login-submit" type="submit" disabled={!canSubmit}>
          {busy ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}

function GerenciaisScreen({
  currentUser,
  usuarios,
  loading,
  error,
  busy,
  form,
  editId,
  editForm,
  search,
  onSearch,
  onFormChange,
  onEditChange,
  onCreate,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}) {
  const gerenciais = usuarios.filter((usuario) => usuario.perfil === 'Gerencial')
  const activeCount = gerenciais.filter((usuario) => usuario.ativo).length
  const query = search.trim().toLowerCase()
  const filtered = gerenciais.filter((usuario) =>
    `${usuario.nome} ${usuario.email}`.toLowerCase().includes(query),
  )

  return (
    <section className="users-card gerenciais-card">
      <div className="card-toolbar">
        <h2>Usuários Gerenciais</h2>

        <label className="search-field">
          <Icon name="search" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Nome ou e-mail"
            type="search"
          />
        </label>
      </div>

      <form className="gerencial-create" onSubmit={onCreate} noValidate>
        <label className="form-row">
          <span>Nome</span>
          <input
            value={form.nome}
            onChange={(event) => onFormChange({ nome: event.target.value })}
            type="text"
            minLength={4}
            required
          />
        </label>
        <label className="form-row">
          <span>E-mail</span>
          <input
            value={form.email}
            onChange={(event) => onFormChange({ email: event.target.value })}
            type="email"
            required
          />
        </label>
        <label className="form-row">
          <span>Senha inicial</span>
          <input
            value={form.senha}
            onChange={(event) => onFormChange({ senha: event.target.value })}
            type="password"
            minLength={8}
            required
            aria-describedby="gerencial-password-hint"
          />
          <small id="gerencial-password-hint">Mínimo 8 caracteres.</small>
        </label>
        <button className="create-button" type="submit" disabled={busy}>
          <Icon name="plus" />
          <span>{busy ? 'Criando...' : 'Criar Gerencial'}</span>
        </button>
      </form>

      {error && <p className="table-message is-error">{error}</p>}
      {loading && <p className="table-message">Carregando gerenciais...</p>}

      {!loading && (
        <div className="users-table gerenciais-table" role="table" aria-label="Usuários Gerenciais">
          <div className="table-row table-head" role="row">
            <span role="columnheader">NOME</span>
            <span role="columnheader">EMAIL</span>
            <span role="columnheader">STATUS</span>
            <span role="columnheader">AÇÕES</span>
          </div>

          {filtered.map((usuario) => {
            const isEditing = editId === usuario.id
            const isSelf = usuario.auth_user_id === currentUser?.auth_user_id
            const cannotDeactivate = isSelf || (usuario.ativo && activeCount <= 1)

            return (
              <div className="table-row gerencial-row" role="row" key={usuario.id}>
                <div className="name-cell" role="cell">
                  <span className="avatar-mini">
                    <Icon name="gear" />
                  </span>
                  {isEditing ? (
                    <input
                      value={editForm.nome}
                      onChange={(event) => onEditChange({ nome: event.target.value })}
                      type="text"
                    />
                  ) : (
                    <strong>{usuario.nome}</strong>
                  )}
                </div>

                <span className="email-cell" role="cell">
                  {isEditing ? (
                    <input
                      value={editForm.email}
                      onChange={(event) => onEditChange({ email: event.target.value })}
                      type="email"
                    />
                  ) : (
                    usuario.email
                  )}
                </span>

                <span className="status-cell" role="cell">
                  {isEditing ? (
                    <label className="status-toggle">
                      <input
                        checked={editForm.ativo}
                        disabled={cannotDeactivate}
                        onChange={(event) => onEditChange({ ativo: event.target.checked })}
                        type="checkbox"
                      />
                      <span>{editForm.ativo ? 'Ativo' : 'Inativo'}</span>
                    </label>
                  ) : (
                    <span className={`status-pill ${usuario.ativo ? 'is-active' : 'is-inactive'}`}>
                      {usuario.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  )}
                </span>

                <span className="actions-cell" role="cell">
                  {isEditing ? (
                    <>
                      <button className="secondary-button" type="button" onClick={onCancelEdit}>
                        Cancelar
                      </button>
                      <button className="primary-button" type="button" disabled={busy} onClick={onSaveEdit}>
                        Salvar
                      </button>
                    </>
                  ) : (
                    <button className="secondary-button" type="button" onClick={() => onStartEdit(usuario)}>
                      Editar
                    </button>
                  )}
                </span>
              </div>
            )
          })}

          {filtered.length === 0 && <p className="table-message">Nenhum gerencial encontrado.</p>}
        </div>
      )}
    </section>
  )
}

function Gauge({ value, label }) {
  return (
    <div className="report-gauge" style={{ '--value': `${value}%` }}>
      <div className="gauge-ring">
        <span>{value}%</span>
      </div>
      <strong>{label}</strong>
    </div>
  )
}

function ReportScreen() {
  const barItems = [
    ['ATAKAREJO SE', 594724],
    ['ATAKAREJO 21', 50138],
    ['G BAR CD SE', 40694],
    ['ATAC SOBRAL', 26644],
    ['VANGUARDA CD', 19592],
    ['ATAKAREJO VT', 11295],
    ['ELIZEU MARTI', 10681],
    ['MAT FREI SER', 9804],
    ['WMS SANTA RI', 8594],
    ['SUPER LITO', 8265],
  ]

  const tableRows = [
    ['17857', '1 de jun.', '3 de jun.', 'AVINE', '15921', 'MA DE JESUS', 'AVARIA NA ENTREGA', 'AVINE', 'R$ 90,10'],
    ['171950', '1 de jun.', '5 de jun.', 'AVINE', '5528', 'MATEUS MAIOB', 'OVOS PODRES', 'AVINE', 'R$ 409,50'],
    ['120152', '1 de jun.', '3 de jun.', 'AVINE', '1287', 'MAT. JOAO PA', 'AVARIA NO PDV', 'AVINE', 'R$ 324,01'],
    ['40164', '1 de jun.', '2 de jun.', 'AVINE', '20189', 'MAT FLORIANO', 'AVARIA NA ENTREGA', 'AVINE', 'R$ 149,80'],
    ['1000', '1 de jun.', '3 de jun.', 'AVINE', '25224', 'MAT HIPER DO', 'OVOS PODRES', 'AVINE', 'R$ 12,36'],
  ]

  return (
    <section className="report-page" aria-label="Relatório Solicitante BI">
      <div className="report-filters">
        {['1 de jun. de 2026 - 17 de jun. de 2026', 'Vendedor', 'Cidade', 'UF', 'Motivo', 'NFD', 'Loja', 'Promotor'].map((label) => (
          <button className="report-filter" type="button" key={label}>
            <span>{label}</span>
            <span className="select-chevron" />
          </button>
        ))}
        <div className="report-status">
          <span className="donut-mini" />
          <small>Feita<br />Pendente</small>
        </div>
        <div className="report-kpi is-total">
          <small>Valor Total</small>
          <strong>R$ 1.491.439,77</strong>
        </div>
        <div className="report-kpi">
          <small>Total de NFD's</small>
          <strong>2.448</strong>
        </div>
        <div className="report-kpi">
          <small>FSTD Feita</small>
          <strong>2.144</strong>
        </div>
        <div className="report-kpi is-danger">
          <small>FSTD Pendente</small>
          <strong>302</strong>
        </div>
      </div>

      <div className="report-grid">
        <div className="report-panel pie-panel">
          <div className="pie-chart" />
          <ul className="pie-legend">
            {['AVARIA NA ENTREGA', 'AVARIA NO PDV', 'AVARIA NO DEPÓSITO', 'OVOS PODRES', 'Pendente FSTD', 'AVARIA DE VIAGEM', 'OVOS VENCIDOS', 'FALTA DE PRODUTO', 'OVOS MOFADOS', 'Outros'].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="report-panel metric-panel">
          <Gauge value={53} label="Retorno GAL" />
          <dl>
            <div>
              <dt>Total de Ovos Galinha</dt>
              <dd>1.270.268</dd>
            </div>
            <div>
              <dt>Retorno GAL</dt>
              <dd>671.634,31</dd>
            </div>
          </dl>
        </div>

        <div className="report-panel metric-panel">
          <dl>
            <div>
              <dt>Total de Ovos Codorna</dt>
              <dd>329.340</dd>
            </div>
            <div>
              <dt>Retorno COD</dt>
              <dd>49.061</dd>
            </div>
          </dl>
          <Gauge value={15} label="Retorno" />
        </div>

        <div className="report-panel bar-panel">
          <h3>Valor (R$)</h3>
          {barItems.map(([label, value]) => (
            <div className="bar-row" key={label}>
              <span>{label}</span>
              <strong style={{ width: `${Math.max(8, value / 11000)}%` }}>R$ {value.toLocaleString('pt-BR')}</strong>
            </div>
          ))}
        </div>

        <div className="report-panel report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                {['NFD', 'Emissão', 'Envio', 'Regional Master', 'Cód.', 'Loja', 'Motivo', 'Promotor', 'Valor (R$)'].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.join('-')}>
                  {row.map((cell, index) => (
                    <td key={`${cell}-${index}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="report-panel line-panel">
          <svg viewBox="0 0 900 190" role="img" aria-label="Valor por dia">
            <path className="line-grid" d="M20 25H875M20 75H875M20 125H875M20 175H875M90 15V180M180 15V180M270 15V180M360 15V180M450 15V180M540 15V180M630 15V180M720 15V180M810 15V180" />
            <polyline className="line-chart" points="20,120 95,42 170,128 245,150 320,136 395,50 450,176 505,38 580,120 655,52 730,132 805,150 875,132" />
            {[['20','120'],['95','42'],['170','128'],['245','150'],['320','136'],['395','50'],['450','176'],['505','38'],['580','120'],['655','52'],['730','132'],['805','150'],['875','132']].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="4" />
            ))}
          </svg>
        </div>
      </div>
    </section>
  )
}

function NotaStatusIcon({ status }) {
  const isDone = status === 'FSTD'

  return (
    <span className={`nota-file-icon ${isDone ? 'is-done' : 'is-pending'}`} aria-hidden="true">
      <span />
    </span>
  )
}

function NotesPagination({ pages }) {
  return (
    <nav className="pagination notes-pagination" aria-label="Páginas da lista de NFD">
      <button type="button" disabled aria-label="Página anterior">&lsaquo;</button>
      <button className="is-active" type="button">1</button>
      <button type="button">2</button>
      <button type="button">3</button>
      <button type="button">4</button>
      <button type="button">5</button>
      <span>...</span>
      <button type="button">{pages}</button>
      <button type="button" aria-label="Próxima página">&rsaquo;</button>
    </nav>
  )
}

function NotasScreen({ search, onSearch }) {
  const [statusFilter, setStatusFilter] = useState('')
  const query = search.trim().toLowerCase()

  const filteredGroups = mockNotasGroups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) => {
        const matchesQuery = `${row.loja} ${row.nfd} ${row.status}`.toLowerCase().includes(query)
        const matchesStatus = !statusFilter || row.status === statusFilter
        return matchesQuery && matchesStatus
      }),
    }))
    .filter((group) => group.rows.length > 0)

  return (
    <section className="notes-page">
      <div className="notes-card">
        <div className="notes-toolbar">
          <h2>NFD</h2>

          <div className="toolbar-actions">
            <label className="search-field">
              <Icon name="search" />
              <input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Procurar"
                type="search"
              />
            </label>

            <label className="filter-field">
              <Icon name="filter" />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">Filtrar</option>
                <option value="Pendente">Pendente</option>
                <option value="FSTD">FSTD</option>
              </select>
            </label>
          </div>
        </div>

        {filteredGroups.map((group) => (
          <section className="notes-date-group" key={group.date}>
            <h3>{group.date}</h3>

            <div className="notes-table" role="table" aria-label={`NFDs de ${group.date}`}>
              <div className="notes-row notes-head" role="row">
                <span role="columnheader">LOJA</span>
                <span role="columnheader">NFD</span>
                <span role="columnheader">STATUS</span>
              </div>

              {group.rows.map((row) => (
                <div className="notes-row" role="row" key={`${group.date}-${row.loja}-${row.nfd}`}>
                  <span className="notes-store-cell" role="cell">
                    <NotaStatusIcon status={row.status} />
                    <strong>{row.loja}</strong>
                  </span>
                  <span role="cell">{row.nfd}</span>
                  <span role="cell">{row.status}</span>
                </div>
              ))}
            </div>

            <NotesPagination pages={group.pages} />
          </section>
        ))}

        {filteredGroups.length === 0 && (
          <p className="table-message">Nenhuma NFD encontrada.</p>
        )}
      </div>
    </section>
  )
}

function PlaceholderScreen({ title }) {
  return (
    <section className="users-card placeholder-card">
      <h2>{title}</h2>
      <p className="table-message">Módulo protegido para gerenciais ativos.</p>
    </section>
  )
}

function App() {
  const navigate = useNavigate()
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [selectedItem, setSelectedItem] = useState('relatorios')
  const [session, setSession] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginBusy, setLoginBusy] = useState(false)
  const [authError, setAuthError] = useState('')
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
  const [gerencialForm, setGerencialForm] = useState(initialGerencialForm)
  const [gerencialEditId, setGerencialEditId] = useState('')
  const [gerencialEditForm, setGerencialEditForm] = useState({
    nome: '',
    email: '',
    ativo: true,
  })
  const [gerencialBusy, setGerencialBusy] = useState(false)
  const [gerencialError, setGerencialError] = useState('')
  const [profilePhoto, setProfilePhoto] = useState('')
  async function validateSession(activeSession, options = {}) {
    const user = activeSession?.user

    if (!user) {
      setSession(null)
      setCurrentUser(null)
      setProfilePhoto('')
      setAuthLoading(false)
      return null
    }

    const { data, error: profileError } = await supabase
      .from('usuarios')
      .select(usuarioSelect)
      .eq('auth_user_id', user.id)
      .maybeSingle()

    const requiredPerfil = options.requiredPerfil ?? 'Gerencial'

    if (profileError || !data || data.ativo !== true) {
      await supabase.auth.signOut()
      setSession(null)
      setCurrentUser(null)
      setAuthError(
        options.permissionMessage ??
          `Acesso permitido somente para usuários ${requiredPerfil} ativos.`,
      )
      setAuthLoading(false)
      return null
    }

    if (data.perfil !== requiredPerfil) {
      if (data.perfil === 'Promotor' || data.perfil === 'Entregador') {
        setSession(null)
        setCurrentUser(null)
        setAuthError('')
        setAuthLoading(false)
        navigate(`/acesso/${data.perfil.toLowerCase()}`, { replace: true })
        return null
      }

      await supabase.auth.signOut()
      setSession(null)
      setCurrentUser(null)
      setAuthError(
        options.permissionMessage ??
          `Acesso permitido somente para usuÃ¡rios ${requiredPerfil} ativos.`,
      )
      setAuthLoading(false)
      return null
    }

    setSession(activeSession)
    setCurrentUser(data)
    if (data.foto_url) {
      try {
        setProfilePhoto(await getProfilePhotoSignedUrl(data.foto_url))
      } catch {
        setProfilePhoto('')
      }
    } else {
      setProfilePhoto('')
    }
    setAuthError('')
    setAuthLoading(false)
    return data
  }

  async function loadUsuarios() {
    setLoading(true)
    setError('')

    const { data, error: requestError } = await supabase
      .from('usuarios')
      .select(usuarioSelect)
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

    const [nfdNotasResult, promotoresResult, vinculosResult] = await Promise.all([
      fetchAllNfdNotas(
        'codigo_cliente, nome_abreviado, uf, cidade',
        (query) => query.order('codigo_cliente', { ascending: true }),
      ),
      supabase
        .from('usuarios')
        .select('id, nome, perfil, estado')
        .eq('perfil', 'Promotor')
        .order('nome', { ascending: true }),
      supabase
        .from('loja_promotores')
        .select('id, loja_id, promotor_id, posicao')
        .order('posicao', { ascending: true }),
    ])

    const requestError = nfdNotasResult.error || promotoresResult.error || vinculosResult.error

    if (requestError) {
      setLojasError(requestError.message)
      setLojas([])
      setPromotores([])
      setLojaPromotores([])
    } else {
      const lojasPorCodigo = new Map()

      for (const nota of nfdNotasResult.data ?? []) {
        const codigo = String(nota.codigo_cliente ?? '').trim()
        const nome = String(nota.nome_abreviado ?? '').trim()
        const uf = normalizaUf(nota.uf)
        const cidade = String(nota.cidade ?? '').trim()

        if (codigo && nome && uf && cidade && !lojasPorCodigo.has(codigo)) {
          lojasPorCodigo.set(codigo, { codigo, nome, uf, cidade })
        }
      }

      const lojasReais = [...lojasPorCodigo.values()]
      const { data: lojasSincronizadas, error: lojasSyncError } = lojasReais.length
        ? await supabase
            .from('lojas')
            .upsert(lojasReais, { onConflict: 'codigo' })
            .select('id, codigo, nome, uf, cidade, created_at')
            .order('codigo', { ascending: true })
        : { data: [], error: null }

      if (lojasSyncError) {
        setLojasError(lojasSyncError.message)
        setLojas([])
        setPromotores([])
        setLojaPromotores([])
      } else {
        setLojas(lojasSincronizadas ?? [])
        setPromotores(promotoresResult.data ?? [])
        setLojaPromotores(vinculosResult.data ?? [])
      }
    }

    setLojasLoading(false)
  }

  async function loadOperationalData() {
    await Promise.all([loadUsuarios(), loadLojas()])
  }

  useEffect(() => {
    let isMounted = true

    async function bootstrapAuth() {
      const { data } = await supabase.auth.getSession()
      if (!isMounted) return
      const usuario = await validateSession(data.session)
      if (usuario && isMounted) {
        await loadOperationalData()
      }
    }

    bootstrapAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return
      if (!nextSession) {
        setSession(null)
        setCurrentUser(null)
        setProfilePhoto('')
        setAuthLoading(false)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
    // Auth bootstrap runs once per route load; auth state changes are handled by the subscription above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const isPerfil = selectedItem === 'perfil'
  const isLojas = selectedItem === 'lojas'
  const isUsuarios = selectedItem === 'usuarios'
  const isConfiguracoes = selectedItem === 'configuracoes'
  const isDashboard = selectedItem === 'dashboard'
  const isNotas = selectedItem === 'notas'
  const isMotivos = selectedItem === 'motivos'
  const isRecolhimento = selectedItem === 'recolhimento'
  const isRelatorios = selectedItem === 'relatorios'
  const pageTitle = isPerfil
    ? 'Perfil'
    : isLojas
    ? 'Lojas'
    : isConfiguracoes
        ? 'Configurações'
        : isDashboard
          ? 'Dashboard'
          : isNotas
            ? 'Nota Fiscal'
            : isMotivos
              ? 'Motivos'
              : isRecolhimento
                ? 'Recolhimento'
          : isRelatorios
            ? 'Relatório'
            : 'Cadastro de Usuário'
  const tableTitle = 'Usuários'
  const pageSubtitle = isPerfil
    ? 'Dados da conta gerencial.'
    : isLojas
    ? 'Roteirização dos promotores.'
    : isConfiguracoes
        ? 'Usuários com acesso ao painel gerencial.'
        : isDashboard
          ? 'Visão geral do painel Avine.'
          : isNotas
            ? 'Preenchimento de FSTD logística ou lojas sem promotor.'
            : isMotivos
              ? 'Cadastro de motivos de devolução.'
              : isRecolhimento
                ? 'Fila logística de recolhimentos.'
          : isRelatorios
            ? 'Relatório Solicitante BI.'
            : 'Lista de cadastro de usuários (promotores e motoristas).'
  const heroIcon = isPerfil
    ? 'users'
    : isLojas
    ? 'pin'
    : isConfiguracoes
        ? 'gear'
        : isNotas || isMotivos
          ? 'notes'
          : isRecolhimento
            ? 'logs'
        : isRelatorios || isDashboard
          ? 'chart'
          : 'users'

  async function handleCreateUsuario(event) {
    event.preventDefault()
    const payload = {
      email: form.email.trim().toLowerCase(),
      nome: form.nome.trim().toUpperCase(),
      password: form.senha,
      perfil: form.perfil,
      estado: form.estado,
      fotos_habilitadas: form.fotos_habilitadas,
    }

    if (
      !emailPattern.test(payload.email) ||
      payload.nome.length < 4 ||
      payload.password.length < 8 ||
      isNomeDuplicado(payload.nome, usuarios) ||
      !perfis.includes(payload.perfil) ||
      !estados.includes(payload.estado)
    ) {
      setFormError(
        isNomeDuplicado(payload.nome, usuarios)
          ? 'Informe o sobrenome para diferenciar este usuário.'
          : 'Revise os campos obrigatórios antes de cadastrar.',
      )
      return
    }

    setSaving(true)
    setFormError('')

    let insertError = null
    try {
      await createOperationalUser(payload)
    } catch (createError) {
      insertError = createError
    }

    if (insertError) {
      setFormError(
        insertError.code === '23505'
          ? insertError.message.includes('usuarios_nome')
            ? 'Informe o sobrenome para diferenciar este usuário.'
            : 'Este e-mail já está cadastrado.'
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
          ? 'Este código já está cadastrado.'
          : 'Revise os campos obrigatórios antes de cadastrar.',
      )
      return
    }

    setSavingLoja(true)
    setLojaFormError('')

    const { error: insertError } = await supabase.from('lojas').insert(payload)

    if (insertError) {
      setLojaFormError(insertError.code === '23505' ? 'Este código já está cadastrado.' : insertError.message)
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

    const loja = lojas.find((item) => item.id === lojaId)
    const promotor = promotores.find((item) => item.id === promotorId)

    if (!loja || !promotor || !isMesmoUf(loja, promotor)) {
      setLojasError('Selecione um promotor com a mesma UF da loja.')
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
          ? 'Informe o sobrenome para diferenciar este usuário.'
          : 'Revise os campos obrigatórios antes de salvar.',
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
            ? 'Informe o sobrenome para diferenciar este usuário.'
            : 'Este e-mail já está cadastrado.'
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

    const shouldDelete = window.confirm(`Excluir usuário ${selectedUsuario.nome}?`)
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

  async function handleLogin({ email, password }) {
    setLoginBusy(true)
    setAuthError('')

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (loginError) {
      setAuthError('E-mail ou senha inválidos.')
      setLoginBusy(false)
      return
    }

    const usuario = await validateSession(data.session, {
      permissionMessage: 'Você não tem permissão para acessar o painel gerencial.',
    })

    if (usuario) {
      await loadOperationalData()
    }

    setLoginBusy(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setSession(null)
    setCurrentUser(null)
    setProfilePhoto('')
    setSelectedItem('relatorios')
    setUsuarios([])
    setLojas([])
    setPromotores([])
    setLojaPromotores([])
    setAuthError('')
  }

  async function handleCreateGerencial(event) {
    event.preventDefault()

    const payload = {
      nome: normalizaTexto(gerencialForm.nome),
      email: gerencialForm.email.trim().toLowerCase(),
      password: gerencialForm.senha,
    }

    if (
      payload.nome.length < 4 ||
      !emailPattern.test(payload.email) ||
      payload.password.length < 8
    ) {
      setGerencialError('Revise nome, email e senha antes de criar.')
      return
    }

    setGerencialBusy(true)
    setGerencialError('')

    try {
      await createGerencialUser(payload)
    } catch (rpcError) {
      setGerencialError(rpcError instanceof Error ? rpcError.message : 'Não foi possível criar o Gerencial.')
      setGerencialBusy(false)
      return
    }

    setGerencialForm(initialGerencialForm)
    setGerencialBusy(false)
    await loadUsuarios()
  }

  function startEditGerencial(usuario) {
    setGerencialEditId(usuario.id)
    setGerencialEditForm({
      nome: usuario.nome,
      email: usuario.email,
      ativo: usuario.ativo,
    })
    setGerencialError('')
  }

  function cancelEditGerencial() {
    setGerencialEditId('')
    setGerencialEditForm({ nome: '', email: '', ativo: true })
    setGerencialError('')
  }

  async function handleSaveGerencial() {
    const payload = {
      p_usuario_id: gerencialEditId,
      p_nome: normalizaTexto(gerencialEditForm.nome),
      p_email: gerencialEditForm.email.trim().toLowerCase(),
      p_ativo: gerencialEditForm.ativo,
    }

    if (!payload.p_usuario_id || payload.p_nome.length < 4 || !emailPattern.test(payload.p_email)) {
      setGerencialError('Revise nome e email antes de salvar.')
      return
    }

    setGerencialBusy(true)
    setGerencialError('')

    const { data, error: rpcError } = await supabase.rpc('update_gerencial_user', payload)

    if (rpcError) {
      setGerencialError(rpcError.message)
      setGerencialBusy(false)
      return
    }

    if (data?.auth_user_id === currentUser?.auth_user_id) {
      setCurrentUser(data)
    }

    cancelEditGerencial()
    setGerencialBusy(false)
    await loadUsuarios()
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

  async function handleProfileSave(nome, photoFile = null) {
    const normalizedName = normalizaTexto(nome).toUpperCase()
    if (normalizedName.length < 4) return

    let uploadedPhoto = null

    if (photoFile) {
      if (!currentUser.auth_user_id) {
        throw new Error('Usuário autenticado sem identificador de Auth.')
      }

      uploadedPhoto = await uploadProfilePhoto(currentUser.auth_user_id, photoFile)
    }

    const payload = uploadedPhoto
      ? { nome: normalizedName, foto_url: uploadedPhoto.path }
      : { nome: normalizedName }

    const { error: updateError } = await supabase
      .from('usuarios')
      .update(payload)
      .eq('id', currentUser.id)

    if (updateError) {
      throw updateError
    }

    setCurrentUser((current) =>
      current
        ? {
            ...current,
            nome: normalizedName,
            foto_url: uploadedPhoto?.path ?? current.foto_url,
          }
        : current,
    )

    if (uploadedPhoto) {
      setProfilePhoto(uploadedPhoto.signedUrl)
    }

    await loadUsuarios()
  }

  function handleSelectItem(item) {
    setSelectedItem(item)
    setSearch('')
    setFilterOpen(false)
    setCadastroOpen(false)
    setGerencialError('')
    setGerencialEditId('')
  }

  function closeCadastro() {
    setCadastroOpen(false)
    setFormError('')
    setLojaFormError('')
  }

  if (authLoading) {
    return (
      <main className="login-shell">
        <p className="auth-loading">Validando sessão...</p>
      </main>
    )
  }

  if (!session || !currentUser) {
    return (
      <LoginScreen
        busy={loginBusy}
        error={authError}
        title="Painel Gerencial"
        onSubmit={handleLogin}
      />
    )
  }

  return (
    <div className="admin-shell">
      <Sidebar
        expanded={sidebarExpanded}
        selectedItem={selectedItem}
        currentUser={currentUser}
        profilePhoto={profilePhoto}
        onLogout={handleLogout}
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

        {isPerfil ? (
          <PerfilScreen
            user={currentUser}
            profilePhoto={profilePhoto}
            onSave={handleProfileSave}
          />
        ) : isConfiguracoes ? (
          <GerenciaisScreen
            currentUser={currentUser}
            usuarios={usuarios}
            loading={loading}
            error={gerencialError}
            busy={gerencialBusy}
            form={gerencialForm}
            editId={gerencialEditId}
            editForm={gerencialEditForm}
            search={search}
            onSearch={setSearch}
            onFormChange={(patch) => setGerencialForm((current) => ({ ...current, ...patch }))}
            onEditChange={(patch) => setGerencialEditForm((current) => ({ ...current, ...patch }))}
            onCreate={handleCreateGerencial}
            onStartEdit={startEditGerencial}
            onCancelEdit={cancelEditGerencial}
            onSaveEdit={handleSaveGerencial}
          />
        ) : isRelatorios ? (
          <ReportScreen />
        ) : isNotas ? (
          <NotasScreen search={search} onSearch={setSearch} />
        ) : isLojas ? (
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
        ) : isUsuarios ? (
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
                  <span>Cadastrar Usuário</span>
                </button>
              </div>
            </div>

            {error && <p className="table-message is-error">{error}</p>}
            {loading && <p className="table-message">Carregando usuários...</p>}

            {!loading && (
              <div className="users-table" role="table" aria-label="Usuários">
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
                  <p className="table-message">Nenhum usuário encontrado.</p>
                )}
              </div>
            )}
          </section>
        ) : (
          <PlaceholderScreen title={pageTitle} />
        )}
      </main>

      {isCadastroOpen && isUsuarios && (
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

