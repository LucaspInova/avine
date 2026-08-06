import { useEffect, useMemo, useRef, useState } from 'react'
import { useInvoiceMutations, useInvoices } from '../../domains/invoices'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../domains/auth/AuthProvider.jsx'
import { can } from '../../domains/auth/model/capabilities'
import { supabase } from '../../shared/lib/supabaseClient'
import {
  createGerencialUser,
  createOperationalUser,
  deleteManagedUser,
  listManagedUsers,
  setManagedUserAccess,
  updateManagedUser,
} from '../../domains/users'
import {
  getProfilePhotoSignedUrl,
  uploadProfilePhoto,
  validateProfilePhoto,
} from '../../shared/lib/profilePhoto'
import { isMesmoUf, listStores, sortStoresByCode } from '../../domains/stores'
import { getProfileLabel } from '../../shared/lib/profileLabels'
import { getPasswordValidationMessage, PASSWORD_MIN_LENGTH } from '../../shared/lib/passwordPolicy'
import { InvoiceIcon } from '../../shared/components/InvoiceIcon.jsx'
import { GerencialFstdModal } from './features/fstd/GerencialFstdModal.jsx'
import { GerencialFinalizedNfdModal } from './features/fstd/GerencialFinalizedNfdModal.jsx'
import { GerencialApplicationShell } from './features/shell/GerencialApplicationShell.jsx'
import avineLogo from '../../shared/assets/foto_logoavine.png'
import profileUserIcon from '../../shared/assets/ui-icons/do-utilizador.png'
import pdfIcon from '../../shared/assets/ui-icons/arquivo-pdf.png'
import LogoutConfirmDialog from '../../shared/components/LogoutConfirmDialog.jsx'
import { Pagination } from '../../shared/ui'
import './GerencialApp.css'

const estados = ['CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL']
const estadosLojas = [...estados, 'TO']
const perfisOperacionais = ['Promotor']
const perfisCadastro = ['Admin', 'Gerencial', 'Promotor']
const perfisEditaveis = ['Promotor']
const perfisCadastroUi = [
  { value: 'Admin', label: 'Admin', authRole: 'admin' },
  { value: 'Gerencial', label: 'Gerencial', authRole: 'gerencial' },
  { value: 'Promotor', label: 'Promotor' },
]
const emptyPromotorSlots = [1, 2, 3]
const USERS_PAGE_SIZE = 10

const navItems = [
  { id: 'usuarios', label: 'Usuários', icon: 'user-plus' },
  { id: 'lojas', label: 'Lojas', icon: 'pin' },
  { id: 'notas', label: 'Notas', icon: 'notes' },
]

const gerencialScreenIds = ['usuarios', 'lojas', 'notas']
const gerencialScreenStorageKey = 'avine-gerencial-last-screen'

function getInitialGerencialScreen() {
  if (typeof window === 'undefined') return 'lojas'

  try {
    const savedScreen = window.localStorage.getItem(gerencialScreenStorageKey)
    if (savedScreen === 'configuracoes') return 'usuarios'
    return gerencialScreenIds.includes(savedScreen) ? savedScreen : 'lojas'
  } catch {
    return 'lojas'
  }
}

const initialUserForm = {
  email: '',
  nome: '',
  senha: '',
  perfil: '',
  auth_role: 'admin',
  estado: '',
  ufs: [],
  fotos_habilitadas: false,
}

const initialLojaForm = {
  codigo: '',
  nome: '',
  uf: '',
  cidade: '',
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NOTES_PAGE_SIZE = 10

function isAdministrativeProfile(user) {
  return user?.perfil === 'Admin' || user?.perfil === 'Gerencial'
}

function isScopedGerencial(user) {
  return user?.perfil === 'Gerencial' && user.auth_role === 'gerencial'
}

function getUserInitials(name) {
  return String(name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || 'US'
}

function isUserActive(user) {
  return user.ativo === true && user.acesso_habilitado === true
}

function getGerencialName(user) {
  return user.gerencial_nome ?? user.gerencial?.nome ?? '-'
}

function getManagedRoleLabel(user) {
  return getProfileLabel(user?.perfil)
}

function getManagedRoleKey(user) {
  return user?.perfil ?? ''
}

function formatNoteDate(value) {
  const date = String(value ?? '').slice(0, 10)
  const [year, month, day] = date.split('-')
  return year && month && day ? `${day}/${month}/${year}` : 'Sem data'
}

function formatNoteQuantity(value) {
  return Number(value ?? 0).toLocaleString('pt-BR')
}

function getNoteDateKey(note) {
  return String(note.data_referencia ?? note.data_emissao ?? '').slice(0, 10) || 'sem-data'
}


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

  if (name === 'user-plus') {
    return (
      <svg {...props}>
        <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <path d="M19 8v6" />
        <path d="M22 11h-6" />
      </svg>
    )
  }

  if (name === 'shield') {
    return (
      <svg {...props}>
        <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    )
  }

  if (name === 'more') {
    return (
      <svg {...props}>
        <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
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

function Sidebar({ expanded, canCollapse, selectedItem, currentUser, profilePhoto, onLogout, onToggle, onSelect }) {
  const profileMenuRef = useRef(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [isLogoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [isLoggingOut, setLoggingOut] = useState(false)
  const profileName = currentUser?.nome ?? 'Usuário'
  const profileRole = getManagedRoleLabel(currentUser)
  const profileState = currentUser?.estado || 'Não informado'
  useEffect(() => {
    if (!profileMenuOpen) return undefined

    function handlePointerDown(event) {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setProfileMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [profileMenuOpen])

  return (
    <aside className={`sidebar ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      <div className="sidebar-brand">
        <button className="brand-button" type="button" aria-label={`Avine ${profileRole}`}>
          <img className="brand-logo" src={avineLogo} alt="Avine" />
        </button>

        {canCollapse && (
          <button
            className="sidebar-toggle"
            type="button"
            onClick={onToggle}
            aria-label={expanded ? 'Recolher sidebar' : 'Expandir sidebar'}
          >
            <span className="sidebar-toggle-chevron" />
          </button>
        )}
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

      <div className="sidebar-user" ref={profileMenuRef}>
        <button
          className={`profile-trigger ${profileMenuOpen ? 'is-open' : ''}`}
          type="button"
          aria-haspopup="menu"
          aria-expanded={profileMenuOpen}
          aria-label="Abrir perfil"
          onClick={() => setProfileMenuOpen((open) => !open)}
        >
          <span className="user-orb">
            {profilePhoto ? <img src={profilePhoto} alt="" /> : <img className="user-placeholder-icon" src={profileUserIcon} alt="" />}
          </span>
          <span className="profile-summary">
            <strong className="profile-name">{profileName}</strong>
            <span className="profile-role">{profileRole}</span>
          </span>
          <span className="profile-chevron" aria-hidden="true" />
        </button>
        {profileMenuOpen && (
          <div className="profile-menu" role="menu" aria-label="Informações do perfil">
            <div className="profile-menu-info">
              <strong>{profileName}</strong>
              <span>{currentUser?.email ?? 'E-mail não informado'}</span>
            </div>

            <dl className="profile-menu-details">
              <div>
                <dt>Função</dt>
                <dd>{profileRole}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>{profileState}</dd>
              </div>
            </dl>

            <div className="profile-menu-divider" />
            <button
              className="profile-logout-button"
              type="button"
              role="menuitem"
              onClick={() => {
                setProfileMenuOpen(false)
                setLogoutConfirmOpen(true)
              }}
            >
              <Icon name="logout" />
              <span>Sair</span>
            </button>
          </div>
        )}
      </div>
      <LogoutConfirmDialog
        isLoading={isLoggingOut}
        isOpen={isLogoutConfirmOpen}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={async () => {
          setLoggingOut(true)
          try {
            await onLogout()
          } finally {
            setLoggingOut(false)
          }
        }}
      />
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

export function CadastroModal({ form, usuarios, currentUser, busy, error, onChange, onClose, onSubmit }) {
  const trimmedEmail = form.email.trim()
  const trimmedName = form.nome.trim()
  const password = form.senha
  const isAdmin = form.perfil === 'Admin'
  const isGerencial = form.perfil === 'Gerencial'
  const currentUserIsGerencial = isScopedGerencial(currentUser)
  const isOperationalProfile = perfisOperacionais.includes(form.perfil)
  const requiresState = isOperationalProfile || isGerencial
  const allowedStates = currentUserIsGerencial ? currentUser.ufs : estados
  const hasEmailInput = trimmedEmail.length > 0
  const isEmailValid = emailPattern.test(trimmedEmail)
  const isEmailInvalid = hasEmailInput && !isEmailValid
  const isNameValid = trimmedName.length >= 4
  const passwordError = getPasswordValidationMessage(password)
  const isPasswordValid = !passwordError
  const hasNomeDuplicado = isNomeDuplicado(trimmedName, usuarios)
  const expectedAuthRole = isAdmin ? 'admin' : isGerencial ? 'gerencial' : 'promotor'
  const isAuthRoleValid = form.auth_role === expectedAuthRole
  const isProfileValid = perfisCadastro.includes(form.perfil) && isAuthRoleValid &&
    (!currentUserIsGerencial || form.perfil === 'Promotor')
  const selectedUfs = form.ufs ?? (form.estado ? [form.estado] : [])
  const isEstadoValid = isAdmin || (isGerencial ? selectedUfs.length > 0 && selectedUfs.every((uf) => allowedStates.includes(uf)) : selectedUfs.length === 1 && allowedStates.includes(selectedUfs[0]))
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
          <h3>Cadastrar Usuário</h3>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar cadastro">
            <Icon name="x" />
          </button>
        </div>

        <div className="modal-grid">
          <div className="modal-main">
            <fieldset className="user-profile-field">
              <legend>Perfil</legend>
              <div className="chip-group">
                {perfisCadastroUi
                  .filter((perfil) => !currentUserIsGerencial || perfil.value === 'Promotor')
                  .map((perfil) => (
                  <button
                    key={`${perfil.value}-${perfil.authRole ?? perfil.label}`}
                    className={`choice-chip ${form.perfil === perfil.value && (!perfil.authRole || form.auth_role === perfil.authRole) ? 'is-selected' : ''}`}
                    type="button"
                    disabled={currentUserIsGerencial && !perfisOperacionais.includes(perfil.value)}
                    title={currentUserIsGerencial && !perfisOperacionais.includes(perfil.value)
                      ? 'Gerencial só pode cadastrar perfis operacionais.'
                      : undefined}
                    onClick={() => onChange({
                      perfil: form.perfil === perfil.value && (!perfil.authRole || form.auth_role === perfil.authRole)
                        ? ''
                        : perfil.value,
                      auth_role: perfil.authRole ?? '',
                    })}
                  >
                    {perfil.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="form-row">
              <span>Nome</span>
              <input
                value={form.nome}
                onChange={(event) => onChange({ nome: event.target.value })}
                minLength={4}
                placeholder="Digite o nome completo"
                type="text"
                required
              />
              {hasNomeDuplicado && (
                <strong className="field-error">Informe o sobrenome para diferenciar este usuário.</strong>
              )}
            </label>

            <label className="form-row">
              <span>E-mail</span>
              <input
                className={isEmailInvalid ? 'is-invalid' : ''}
                value={form.email}
                onChange={(event) => onChange({ email: event.target.value })}
                placeholder="nome@empresa.com"
                type="email"
                required
              />
              {isEmailInvalid && (
                <strong className="field-error">Insira um endereço de e-mail válido.</strong>
              )}
            </label>

            <label className="form-row">
              <span>Senha</span>
              <input
                className={password && !isPasswordValid ? 'is-invalid' : ''}
                value={password}
                onChange={(event) => onChange({ senha: event.target.value })}
                minLength={PASSWORD_MIN_LENGTH}
                placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
                type="password"
                autoComplete="new-password"
                required
              />
              {passwordError && (
                <strong className="field-error">{passwordError}</strong>
              )}
            </label>

            {requiresState && (
              <>
                <fieldset>
                  <legend>UF</legend>
                  <div className="chip-group state-chips">
                    {allowedStates.map((estado) => (
                      <button
                        key={estado}
                        className={`choice-chip ${selectedUfs.includes(estado) ? 'is-selected' : ''}`}
                        type="button"
                        disabled={currentUserIsGerencial}
                        onClick={() => {
                          const nextUfs = isGerencial
                            ? (selectedUfs.includes(estado) ? selectedUfs.filter((uf) => uf !== estado) : [...selectedUfs, estado])
                            : (selectedUfs.includes(estado) ? [] : [estado])
                          onChange({ ufs: nextUfs, estado: nextUfs[0] ?? '' })
                        }}
                      >
                        {estado}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {form.perfil === 'Promotor' && (
                  <label className="form-row" htmlFor="cadastro-gerencial">
                    <span>Gerencial responsável</span>
                    <select
                      id="cadastro-gerencial"
                      value=""
                      disabled
                      aria-label="Gerencial responsável"
                      aria-describedby="gerencial-unavailable-hint"
                    >
                      <option value="">Nenhum gerencial disponível</option>
                    </select>
                    <small id="gerencial-unavailable-hint">
                      O vínculo será habilitado quando o perfil Gerencial existir no sistema.
                    </small>
                  </label>
                )}

                <label className="switch-field">
                  <span>Habilitar fotos?</span>
                  <PhotoSwitch
                    checked={form.fotos_habilitadas}
                    label="Habilitar fotos"
                    onChange={() => onChange({ fotos_habilitadas: !form.fotos_habilitadas })}
                  />
                </label>
              </>
            )}
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
              {isPasswordValid ? 'Senha válida' : `Senha mínima de ${PASSWORD_MIN_LENGTH} caracteres`}
            </span>
            <span className={isProfileValid ? 'is-success' : ''}>
              <Icon name={isProfileValid ? 'check' : 'gear'} />
              {isProfileValid ? 'Perfil de acesso escolhido' : 'Escolha o perfil de acesso'}
            </span>
            {isProfileValid && (
              <span className={isEstadoValid ? 'is-success' : ''}>
                <Icon name={isEstadoValid ? 'check' : 'pin'} />
                {isAdmin ? 'UF não exigida para Admin' : isEstadoValid ? 'UF escolhida' : 'Preencha a UF'}
              </span>
            )}
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

export function CadastroLojaModal({ form, lojas, allowedStates = estadosLojas, busy, error, onChange, onClose, onSubmit }) {
  const codigo = normalizaTexto(form.codigo)
  const nome = normalizaTexto(form.nome)
  const cidade = normalizaTexto(form.cidade)
  const isCodigoValid = codigo.length > 0 && !isCodigoDuplicado(codigo, lojas)
  const isNomeValid = nome.length > 0
  const isUfValid = allowedStates.includes(form.uf)
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
                {allowedStates.map((estado) => (
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

export function InformacoesUsuarioModal({ usuario, onClose, onEdit, onTogglePhotos, photoBusy, canManage = true }) {
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
          <button className="info-person" type="button" onClick={onEdit} disabled={!canManage}>
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
              disabled={photoBusy || !canManage}
              label="Fotos habilitadas"
              onChange={() => onTogglePhotos(usuario)}
            />
          </div>

          <dl className="info-data">
            <div>
              <dt>Perfil de Acesso</dt>
              <dd>{getManagedRoleLabel(usuario)}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{(usuario.ufs?.length ? usuario.ufs : [usuario.estado]).join(', ') || 'Escopo global'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

export function EditarUsuarioModal({
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
  const passwordError = getPasswordValidationMessage(form.senha, { optional: true })
  const isPasswordValid = !passwordError
  const isProfileValid = perfisEditaveis.includes(form.perfil)
  const isEstadoValid = estados.includes(form.estado)
  const canSubmit =
    isEmailValid && isNameValid && !hasNomeDuplicado && isProfileValid && isEstadoValid && !busy && !deleting && isPasswordValid

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

          <label className="edit-field">
            <span>
              Nova senha
              <small>Opcional</small>
            </span>
            <input
              className={form.senha && !isPasswordValid ? 'is-invalid' : ''}
              value={form.senha}
              onChange={(event) => onChange({ senha: event.target.value })}
              minLength={PASSWORD_MIN_LENGTH}
              type="password"
              autoComplete="new-password"
              placeholder="Deixe vazio para manter"
            />
            {passwordError && (
              <strong className="field-error">{passwordError.replace(/^A senha/, 'A nova senha')}</strong>
            )}
          </label>

          <fieldset className="edit-field">
            <legend>
              Perfil
              <small>Necessário</small>
            </legend>
            <div className="chip-group">
              {perfisEditaveis.map((perfil) => (
                <button
                  key={perfil}
                  className={`choice-chip ${form.perfil === perfil ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => onChange({ perfil: form.perfil === perfil ? '' : perfil })}
                >
                  {getProfileLabel(perfil)}
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
            {deleting ? 'Bloqueando...' : 'Bloquear acesso'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function StoreFilterPopover({
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
            {estadosLojas.map((estado) => (
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

export function PromotorSelect({ value, promotores, disabled, onChange }) {
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

export function LojasScreen({
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
  canCreateStore,
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

          {canCreateStore && (
            <button className="create-button" type="button" onClick={onOpenCadastro}>
              <Icon name="plus" />
              <span>Cadastrar Loja</span>
            </button>
          )}
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

export function UsuariosScreen({
  currentUser,
  usuarios,
  loading,
  error,
  busy,
  editId,
  editForm,
  search,
  onSearch,
  onOpenCadastro,
  onOpenUsuario,
  onEditChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  restrictedUfs = [],
}) {
  const [profileFilter, setProfileFilter] = useState('all')
  const [ufFilter, setUfFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const activeAdminCount = usuarios.filter(
    (usuario) => usuario.perfil === 'Admin' && usuario.ativo,
  ).length
  const counts = useMemo(() => ({
    all: usuarios.length,
    Admin: usuarios.filter((usuario) => getManagedRoleKey(usuario) === 'Admin').length,
    Gerencial: usuarios.filter((usuario) => getManagedRoleKey(usuario) === 'Gerencial').length,
    Promotor: usuarios.filter((usuario) => usuario.perfil === 'Promotor').length,
  }), [usuarios])
  const availableUfs = useMemo(
    () => [...new Set(usuarios.map((usuario) => usuario.estado).filter(Boolean))]
      .sort((first, second) => first.localeCompare(second, 'pt-BR')),
    [usuarios],
  )
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return usuarios.filter((usuario) => {
      const matchesSearch = !query || `${usuario.nome} ${usuario.email}`.toLowerCase().includes(query)
      const matchesProfile = profileFilter === 'all' || getManagedRoleKey(usuario) === profileFilter
      const matchesUf = restrictedUfs.length
        ? restrictedUfs.includes(usuario.estado)
        : ufFilter === 'all' || usuario.estado === ufFilter
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' ? isUserActive(usuario) : !isUserActive(usuario))

      return matchesSearch && matchesProfile && matchesUf && matchesStatus
    })
  }, [profileFilter, restrictedUfs, search, statusFilter, ufFilter, usuarios])
  const totalPages = Math.max(1, Math.ceil(filtered.length / USERS_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageUsers = filtered.slice((safePage - 1) * USERS_PAGE_SIZE, safePage * USERS_PAGE_SIZE)
  const pageItems = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1)

    const candidates = [...new Set([1, safePage - 1, safePage, safePage + 1, totalPages])]
      .filter((item) => item >= 1 && item <= totalPages)
      .sort((first, second) => first - second)
    const items = []

    candidates.forEach((item, index) => {
      if (index > 0 && item - candidates[index - 1] > 1) items.push(`ellipsis-${item}`)
      items.push(item)
    })

    return items
  }, [safePage, totalPages])

  function handleEdit(usuario) {
    if (restrictedUfs.length > 0 && usuario.perfil !== 'Promotor') {
      onOpenUsuario(usuario)
      return
    }
    if (usuario.perfil === 'Admin' || usuario.perfil === 'Gerencial') {
      onStartEdit(usuario)
      return
    }

    onOpenUsuario(usuario)
  }

  const summaryCards = [
    { key: 'all', label: 'Total de usuários', value: counts.all, detail: 'Todos os perfis', icon: 'users' },
    { key: 'Gerencial', label: 'Gerencial', value: counts.Gerencial, detail: 'Usuários', icon: 'shield' },
    { key: 'Promotor', label: 'Promotores', value: counts.Promotor, detail: 'Usuários', icon: 'users' },
  ]

  return (
    <section className="users-card user-registration-card">
      <div className="user-filter-bar">
        <label className="user-search-field">
          <Icon name="search" />
          <input
            value={search}
            onChange={(event) => {
              onSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Pesquisar por nome ou e-mail..."
            type="search"
            aria-label="Pesquisar por nome ou e-mail"
          />
        </label>

        <label className="user-select-field">
          <span>Perfil</span>
          <select
            value={profileFilter}
            onChange={(event) => {
              setProfileFilter(event.target.value)
              setPage(1)
            }}
          >
            <option value="all">Todos</option>
            <option value="Admin">Admin</option>
            <option value="Gerencial">Gerencial</option>
            <option value="Promotor">Promotor</option>
          </select>
          <span className="select-chevron" />
        </label>

        <label className="user-select-field">
          <span>UF</span>
          <select
            value={restrictedUfs.length === 1 ? restrictedUfs[0] : ufFilter}
            disabled={restrictedUfs.length > 0}
            onChange={(event) => {
              setUfFilter(event.target.value)
              setPage(1)
            }}
          >
            <option value="all">Todas</option>
            {availableUfs.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
          <span className="select-chevron" />
        </label>

        <label className="user-select-field">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value)
              setPage(1)
            }}
          >
            <option value="all">Todos</option>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
          <span className="select-chevron" />
        </label>

        <button className="create-button user-create-button" type="button" onClick={onOpenCadastro}>
          <Icon name="plus" />
          <span>Cadastrar Usuário</span>
        </button>
      </div>

      <div className="user-summary-grid" aria-label="Resumo de usuários">
        {summaryCards.map((card) => (
          <article className={`user-summary-card is-${String(card.key).toLowerCase()}`} key={card.key}>
            <span className="user-summary-icon"><Icon name={card.icon} /></span>
            <span>
              <small>{card.label}</small>
              <strong>{card.value.toLocaleString('pt-BR')}</strong>
              <em>{card.detail}</em>
            </span>
          </article>
        ))}
      </div>

      <nav className="user-quick-filters" aria-label="Filtros rápidos por perfil">
        {[
          ['all', 'Todos', counts.all],
          ['Admin', 'Admin', counts.Admin],
          ['Gerencial', 'Gerencial', counts.Gerencial],
          ['Promotor', 'Promotor', counts.Promotor],
        ].map(([value, label, count]) => (
          <button
            className={profileFilter === value ? 'is-active' : ''}
            key={value}
            type="button"
            aria-pressed={profileFilter === value}
            onClick={() => {
              setProfileFilter(value)
              setPage(1)
            }}
          >
            {label} ({count.toLocaleString('pt-BR')})
          </button>
        ))}
      </nav>

      {(error) && <p className="table-message is-error">{error}</p>}
      <section className="registration-table-card" aria-label="Lista de usuários">
        {loading && <p className="table-message user-loading-message">Carregando usuários...</p>}

        {!loading && (
          <div className="users-table unified-users-table" role="table" aria-label="Cadastro de Usuários">
            <div className="table-row table-head" role="row">
              <span role="columnheader">NOME</span>
              <span role="columnheader">PERFIL</span>
              <span role="columnheader">GERENCIAL</span>
              <span role="columnheader">E-MAIL</span>
              <span role="columnheader">UF</span>
              <span role="columnheader">STATUS</span>
              <span role="columnheader">AÇÕES</span>
            </div>

            {pageUsers.map((usuario) => {
              const isEditing = editId === usuario.id
              const isLegacyUser = ['admin@avine.com.br', 'avinegerencial@gmail.com'].includes(usuario.email.toLowerCase())
              const isSelf = usuario.auth_user_id === currentUser?.auth_user_id
              const cannotDeactivate = isSelf || (usuario.ativo && activeAdminCount <= 1 && usuario.perfil === 'Admin')
              const profileClass = getManagedRoleKey(usuario).toLowerCase()

              return (
                <div className={`table-row user-registration-row ${isEditing ? 'is-editing' : ''}`} role="row" key={usuario.id}>
                  <div className="name-cell" role="cell">
                    <span className="avatar-mini">{getUserInitials(usuario.nome)}</span>
                    {isEditing ? (
                      <input
                        value={editForm.nome}
                        onChange={(event) => onEditChange({ nome: event.target.value })}
                        type="text"
                        aria-label="Nome"
                      />
                    ) : (
                      <strong>{usuario.nome}</strong>
                    )}
                  </div>

                  <span role="cell" data-label="Perfil">
                    <span className={`profile-pill is-${profileClass}`}>{getManagedRoleLabel(usuario)}</span>
                  </span>

                  <span className="gerencial-cell" role="cell" data-label="Gerencial">{getGerencialName(usuario)}</span>

                  <div className="email-cell" role="cell" data-label="E-mail">
                    {isEditing ? (
                      <>
                        <input
                          value={editForm.email}
                          onChange={(event) => onEditChange({ email: event.target.value })}
                          type="email"
                          aria-label="E-mail"
                        />
                        <input
                          value={editForm.senha}
                          onChange={(event) => onEditChange({ senha: event.target.value })}
                          placeholder="Nova senha (opcional)"
                          type="password"
                          minLength={PASSWORD_MIN_LENGTH}
                          autoComplete="new-password"
                          aria-label="Nova senha"
                        />
                      </>
                    ) : usuario.email}
                  </div>

                  <span className="uf-cell" role="cell" data-label="UF">{usuario.perfil === 'Admin' ? 'Todas' : (usuario.ufs?.length ? usuario.ufs.join(', ') : usuario.estado || '-')}</span>

                  <span className="status-cell" role="cell" data-label="Status">
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
                      <span className={`status-pill ${isUserActive(usuario) ? 'is-active' : 'is-inactive'}`}>
                        <span className="status-dot" aria-hidden="true" />
                        {isUserActive(usuario) ? 'Ativo' : 'Inativo'}
                      </span>
                    )}
                  </span>

                  <span className="actions-cell" role="cell">
                    {isEditing ? (
                      <>
                        <button className="secondary-button" type="button" onClick={onCancelEdit}>Cancelar</button>
                        <button className="primary-button" type="button" disabled={busy} onClick={onSaveEdit}>Salvar</button>
                      </>
                    ) : (
                      <>
                        <button className="secondary-button edit-user-button" type="button" onClick={() => handleEdit(usuario)}>
                          {restrictedUfs.length > 0 && usuario.perfil !== 'Promotor' ? 'Visualizar' : 'Editar'}
                        </button>
                        <details className="user-actions-menu">
                          <summary aria-label={`Mais ações para ${usuario.nome}`}><Icon name="more" /></summary>
                          <div className="user-actions-popover">
                            <button type="button" onClick={() => handleEdit(usuario)}>
                              {restrictedUfs.length > 0 && usuario.perfil !== 'Promotor' ? 'Visualizar' : 'Editar'}
                            </button>
                            <button type="button" disabled={Boolean(restrictedUfs.length > 0 && usuario.perfil !== 'Promotor')}>Resetar senha</button>
                            <button type="button" disabled>{isUserActive(usuario) ? 'Desativar' : 'Ativar'}</button>
                            <button
                              className={isLegacyUser ? 'is-danger' : ''}
                              type="button"
                              disabled={!isLegacyUser}
                              onClick={() => onDelete(usuario)}
                            >
                              Excluir
                            </button>
                          </div>
                        </details>
                      </>
                    )}
                  </span>
                </div>
              )
            })}

            {filtered.length === 0 && <p className="table-message user-empty-message">Nenhum usuário encontrado.</p>}

            <footer className="user-table-footer">
              <span>
                {filtered.length === 0
                  ? 'Mostrando 0 usuários'
                  : `Mostrando ${(safePage - 1) * USERS_PAGE_SIZE + 1} a ${Math.min(safePage * USERS_PAGE_SIZE, filtered.length)} de ${filtered.length} usuários`}
              </span>
              {filtered.length > USERS_PAGE_SIZE && (
                <nav className="user-pagination" aria-label="Paginação de usuários">
                  <button type="button" aria-label="Página anterior" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹</button>
                  {pageItems.map((item) => typeof item === 'number' ? (
                    <button
                      className={safePage === item ? 'is-active' : ''}
                      type="button"
                      key={item}
                      aria-current={safePage === item ? 'page' : undefined}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </button>
                  ) : (
                    <button type="button" key={item} disabled>…</button>
                  ))}
                  <button type="button" aria-label="Próxima página" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>›</button>
                </nav>
              )}
            </footer>
          </div>
        )}
      </section>
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
  if (status === 'Desconhecida') return <InvoiceIcon status="unknown" />

  const visualStatus = status === 'Finalizada' ? 'sent' : status === 'Desconhecida' ? 'unknown' : 'overdue'
  const iconVariant = visualStatus === 'sent' ? 'finalized' : visualStatus === 'unknown' ? 'unknown' : null

  if (iconVariant) {
    const paths = {
      finalized: {
        main: 'M9 1.5H5.625c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0 0 16.5 9h-1.875a1.875 1.875 0 0 1-1.875-1.875V5.25A3.75 3.75 0 0 0 9 1.5Zm6.61 10.936a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 14.47a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z',
        corner: 'M12.971 1.816A5.23 5.23 0 0 1 14.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 0 1 3.434 1.279 9.768 9.768 0 0 0-6.963-6.963Z',
      },
      unknown: {
        main: 'M5.625 1.5H9a3.75 3.75 0 0 1 3.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 0 1 3.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 0 1-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875Z',
        marker: 'M11.625 16.5a1.875 1.875 0 1 0 0-3.75 1.875 1.875 0 0 0 0 3.75Z',
        corner: 'M14.25 5.25a5.23 5.23 0 0 0-1.279-3.434 9.768 9.768 0 0 1 6.963 6.963A5.23 5.23 0 0 0 16.5 7.5h-1.875a.375.375 0 0 1-.375-.375V5.25Z',
      },
    }[iconVariant]

    return (
      <svg className={`document-glyph is-${visualStatus}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {paths.marker && <path d={paths.marker} />}
        <path fillRule="evenodd" d={paths.main} clipRule="evenodd" />
        <path d={paths.corner} />
      </svg>
    )
  }

  return (
    <svg className={`document-glyph is-${visualStatus}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 0 1 3.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 0 1 3.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 0 1-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875ZM9.75 14.25a.75.75 0 0 0 0 1.5H15a.75.75 0 0 0 0-1.5H9.75Z" clipRule="evenodd" />
      <path d="M14.25 5.25a5.23 5.23 0 0 0-1.279-3.434 9.768 9.768 0 0 1 6.963 6.963A5.23 5.23 0 0 0 16.5 7.5h-1.875a.375.375 0 0 1-.375-.375V5.25Z" />
    </svg>
  )
}

const NOTE_STATUS_OPTIONS = ['Finalizada', 'Pendente', 'Desconhecida']

function uniqueSortedValues(values, { uppercase = false } = {}) {
  const unique = new Map()

  values.forEach((value) => {
    const normalized = String(value ?? '').trim()
    if (!normalized) return

    const display = uppercase ? normalized.toUpperCase() : normalized
    const key = display.toLocaleLowerCase('pt-BR')
    if (!unique.has(key)) unique.set(key, display)
  })

  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
}

function NotesFilterPopover({
  notes,
  selectedStatuses,
  selectedUfs,
  selectedCities,
  onToggleStatus,
  onToggleUf,
  onToggleCity,
  onClear,
  onClose,
}) {
  const [expandedSection, setExpandedSection] = useState(null)
  const ufs = uniqueSortedValues(notes.map((note) => note.uf), { uppercase: true })
  const cities = uniqueSortedValues(notes.map((note) => note.cidade))
  const sections = [
    { id: 'status', label: 'Status', options: NOTE_STATUS_OPTIONS, selected: selectedStatuses, onToggle: onToggleStatus },
    { id: 'estado', label: 'Estado', options: ufs, selected: selectedUfs, onToggle: onToggleUf },
    { id: 'cidade', label: 'Cidade', options: cities, selected: selectedCities, onToggle: onToggleCity },
  ]

  return (
    <div className="filter-popover notes-filter-popover">
      {sections.map((section) => {
        const isExpanded = expandedSection === section.id

        return (
          <div className="notes-filter-section" key={section.id}>
            <button
              className={`notes-filter-section-trigger ${isExpanded ? 'is-expanded' : ''}`}
              type="button"
              onClick={() => setExpandedSection(isExpanded ? null : section.id)}
              aria-expanded={isExpanded}
            >
              <span>{section.label}</span>
              <span className="filter-chevron" aria-hidden="true" />
            </button>

            {isExpanded && (
              <div className="filter-options notes-filter-options">
                {section.options.length === 0 ? (
                  <p className="filter-empty">Nenhuma opção encontrada.</p>
                ) : section.options.map((option) => (
                  <label key={option} className="filter-option">
                    <span>{option}</span>
                    <input
                      checked={section.selected.includes(option)}
                      onChange={() => section.onToggle(option)}
                      type="checkbox"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}

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

function NotesPagination({ page, pages, onChange }) {
  return (
    <Pagination
      className="pagination notes-pagination"
      currentPage={page + 1}
      label="Páginas da lista de NFD"
      onPageChange={(nextPage) => onChange(nextPage - 1)}
      totalPages={pages}
    />
  )
}

function NotaFiscalModal({ note, onClose, onPending, onUnknown, onRecognize }) {
  const [invoiceCopied, setInvoiceCopied] = useState(false)
  const [pendingBusy, setPendingBusy] = useState(false)
  const [pendingError, setPendingError] = useState('')
  const [unknownBusy, setUnknownBusy] = useState(false)
  const [unknownError, setUnknownError] = useState('')
  const [unknownConfirmOpen, setUnknownConfirmOpen] = useState(false)
  const [unknownComment, setUnknownComment] = useState('')
  const [recognizeBusy, setRecognizeBusy] = useState(false)
  const [recognizeError, setRecognizeError] = useState('')

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!note) return null

  const isFinalized = note.status === 'Finalizada'
  const isUnknown = note.status === 'Desconhecida'
  const title = `${note.codigo_cliente ?? '-'} - ${note.nota_fiscal ?? '-'}`
  const statusDescription = isFinalized ? 'FSTD Finalizada' : note.status === 'Desconhecida' ? 'NFD Desconhecida' : 'FSTD Pendente'

  async function handleOpenInvoice() {
    window.open('https://meudanfe.com.br/#', '_blank', 'noopener,noreferrer')

    const accessKey = String(note.chave_acesso ?? '').trim()
    if (!accessKey) return

    try {
      await navigator.clipboard.writeText(accessKey)
      setInvoiceCopied(true)
    } catch {
      setInvoiceCopied(false)
    }
  }

  async function handleOpenPending() {
    if (isFinalized || note.status !== 'Pendente' || !onPending || pendingBusy) return

    setPendingBusy(true)
    setPendingError('')
    try {
      await onPending(note)
    } catch (requestError) {
      setPendingError(
        requestError?.message
        || requestError?.details
        || requestError?.hint
        || 'Não foi possível abrir o preenchimento da NFD.',
      )
    } finally {
      setPendingBusy(false)
    }
  }

  function handleOpenUnknownConfirm() {
    if (isFinalized || isUnknown || !onUnknown || unknownBusy) return
    setUnknownComment('')
    setUnknownError('')
    setUnknownConfirmOpen(true)
  }

  async function handleMarkUnknown() {
    if (isFinalized || isUnknown || !onUnknown || unknownBusy) return

    const comment = unknownComment.trim()
    if (comment.length < 5) return

    setUnknownBusy(true)
    setUnknownError('')
    try {
      await onUnknown(note, comment)
      setUnknownConfirmOpen(false)
    } catch (requestError) {
      setUnknownError(
        requestError?.message
        || requestError?.details
        || requestError?.hint
        || 'Não foi possível atualizar a NFD como desconhecida.',
      )
    } finally {
      setUnknownBusy(false)
    }
  }

  async function handleRecognize() {
    if (!isUnknown || !onRecognize || recognizeBusy) return

    setRecognizeBusy(true)
    setRecognizeError('')
    try {
      await onRecognize(note)
    } catch (requestError) {
      setRecognizeError(
        requestError?.message
        || requestError?.details
        || requestError?.hint
        || 'Não foi possível reconhecer novamente esta NFD.',
      )
    } finally {
      setRecognizeBusy(false)
    }
  }

  return (
    <div className="nota-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="nota-modal" role="dialog" aria-modal="true" aria-labelledby="nota-modal-title">
        <header className="nota-modal-titlebar">
          <strong id="nota-modal-title">{title}</strong>
          <button type="button" onClick={onClose} aria-label="Fechar nota fiscal">
            <Icon name="x" />
          </button>
        </header>

        <div className="nota-modal-summary">
          <button className="nota-modal-summary-button is-invoice" type="button" onClick={handleOpenInvoice}>
            <NotaStatusIcon status="Finalizada" />
            <span>
              <strong>NFD</strong>
              <small>Emitida em {formatNoteDate(note.data_emissao)}</small>
            </span>
            <img className="nota-modal-pdf-icon" src={pdfIcon} alt="" aria-hidden="true" />
          </button>

          <button className="nota-modal-summary-button is-status" type="button" disabled={isFinalized || note.status !== 'Pendente' || pendingBusy} onClick={handleOpenPending}>
            <NotaStatusIcon status={note.status} />
            <span>
              <strong>{note.status}</strong>
              <small>{pendingBusy ? 'Abrindo preenchimento...' : statusDescription}</small>
            </span>
            <span className="nota-modal-add" aria-hidden="true">+</span>
          </button>
        </div>

        <div className="nota-modal-body">
          <div className="nota-modal-content">
            <div className="nota-modal-backlink">‹ <strong>{title}</strong></div>
            <h2>Faturado</h2>
            <dl>
              <div>
                <dt>Galinha</dt>
                <dd>{formatNoteQuantity(note.quantidade_galinha)} ovos</dd>
              </div>
              <div>
                <dt>Codorna</dt>
                <dd>{formatNoteQuantity(note.quantidade_codorna)} ovos</dd>
              </div>
            </dl>
          </div>

          <div className="nota-modal-alerts">
            <div className="nota-modal-alert is-pdf">
              <img src={pdfIcon} alt="" aria-hidden="true" />
              <span>
                <strong>Arquivo PDF indisponível!</strong>
                <small>{statusDescription}</small>
              </span>
            </div>
            <div className="nota-modal-alert is-unknown">
              <Icon name="alert" />
              <span>{isUnknown ? 'NFD marcada como desconhecida' : 'Desconheço NF?'}</span>
              {isUnknown ? (
                <button className="is-recognize" type="button" disabled={recognizeBusy} onClick={handleRecognize}>
                  {recognizeBusy ? 'Atualizando...' : 'Reconheço NFD'}
                </button>
              ) : (
                <button type="button" disabled={isFinalized || unknownBusy} onClick={handleOpenUnknownConfirm}>
                  Desconheço
                </button>
              )}
            </div>
          </div>
        </div>

        {invoiceCopied && <p className="nota-modal-copy-feedback" role="status">Chave de acesso copiada.</p>}
        {pendingError && <p className="nota-modal-pending-error" role="alert">{pendingError}</p>}
        {unknownError && <p className="nota-modal-pending-error" role="alert">{unknownError}</p>}
        {recognizeError && <p className="nota-modal-pending-error" role="alert">{recognizeError}</p>}
      </section>

      {unknownConfirmOpen && (
        <div className="nota-unknown-confirm-layer" role="presentation">
          <section className="nota-unknown-confirm" role="dialog" aria-modal="true" aria-labelledby="nota-unknown-confirm-title">
            <header>
              <strong id="nota-unknown-confirm-title">Desconhecer NFD</strong>
              <button type="button" onClick={() => setUnknownConfirmOpen(false)} aria-label="Fechar confirmação">×</button>
            </header>
            <p>Informe por que o usuário não reconhece esta nota fiscal.</p>
            <label>
              <span>Motivo <small>Obrigatório</small></span>
              <textarea
                value={unknownComment}
                onChange={(event) => setUnknownComment(event.target.value)}
                placeholder="Explique o motivo"
                rows="4"
                autoFocus
              />
            </label>
            {unknownError && <strong className="nota-unknown-confirm-error" role="alert">{unknownError}</strong>}
            <footer>
              <button type="button" onClick={() => setUnknownConfirmOpen(false)}>Cancelar</button>
              <button type="button" disabled={unknownComment.trim().length < 5 || unknownBusy} onClick={handleMarkUnknown}>
                {unknownBusy ? 'Atualizando...' : 'Confirmar'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}

function NotasScreen({ search, onSearch, lojas, currentUser, restrictedUfs = [], canEditFinalized = false }) {
  const invoiceFilters = useMemo(() => ({ restrictedUfs }), [restrictedUfs])
  const invoicesQuery = useInvoices(invoiceFilters)
  const invoiceMutations = useInvoiceMutations()
  const notes = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data])
  const loading = invoicesQuery.isLoading
  const error = invoicesQuery.error?.message ?? ''
  const [isFilterOpen, setFilterOpen] = useState(false)
  const [selectedStatuses, setSelectedStatuses] = useState([])
  const [selectedUfs, setSelectedUfs] = useState([])
  const [selectedCities, setSelectedCities] = useState([])
  const [pageByDate, setPageByDate] = useState({})
  const [selectedNote, setSelectedNote] = useState(null)
  const [selectedFstd, setSelectedFstd] = useState(null)
  const [selectedFinalized, setSelectedFinalized] = useState(null)
  const [completionMessage, setCompletionMessage] = useState('')
  const query = search.trim().toLowerCase()

  const filteredGroups = useMemo(() => {
    const groups = new Map()

    notes.forEach((note) => {
      const storeName = note.nome_abreviado?.trim() || note.estabelecimento?.trim() || String(note.codigo_cliente ?? '-')
      const nfd = String(note.nota_fiscal ?? '-')
      const matchesQuery = `${storeName} ${nfd} ${note.status}`.toLowerCase().includes(query)
      const noteUf = String(note.uf ?? '').trim().toUpperCase()
      const noteCity = String(note.cidade ?? '').trim()
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(note.status)
      const matchesUf = selectedUfs.length === 0 || selectedUfs.includes(noteUf)
      const matchesCity = selectedCities.length === 0 || selectedCities
        .some((city) => city.toLocaleLowerCase('pt-BR') === noteCity.toLocaleLowerCase('pt-BR'))
      if (!matchesQuery || !matchesStatus || !matchesUf || !matchesCity) return

      const dateKey = getNoteDateKey(note)
      if (!groups.has(dateKey)) {
        groups.set(dateKey, {
          key: dateKey,
          date: dateKey === 'sem-data' ? 'Sem data' : formatNoteDate(dateKey),
          rows: [],
        })
      }

      groups.get(dateKey).rows.push({
        key: note.chave_acesso || `${dateKey}-${nfd}-${storeName}`,
        loja: storeName,
        nfd,
        status: note.status,
        note,
      })
    })

    return [...groups.values()]
      .sort((a, b) => b.key.localeCompare(a.key))
      .map((group) => {
        const pages = Math.max(1, Math.ceil(group.rows.length / NOTES_PAGE_SIZE))
        const page = Math.min(pageByDate[group.key] ?? 0, pages - 1)
        return {
          ...group,
          pages,
          page,
          rows: group.rows.slice(page * NOTES_PAGE_SIZE, (page + 1) * NOTES_PAGE_SIZE),
        }
      })
  }, [notes, pageByDate, query, selectedCities, selectedStatuses, selectedUfs])

  const activeFiltersCount = selectedStatuses.length + selectedUfs.length + selectedCities.length

  function getStoreForNote(note) {
    return (lojas ?? []).find((item) => String(item.codigo) === String(note.codigo_cliente))
  }

  function handleSelectNote(note) {
    if (note.status === 'Finalizada') {
      const store = getStoreForNote(note)
      if (store) {
        setSelectedNote(null)
        setSelectedFinalized({ note, store })
        return
      }
    }

    setSelectedNote(note)
  }

  async function handlePendingNote(note) {
    if (note.status === 'Finalizada') return
    if (!currentUser?.id) throw new Error('Sessão do usuário Admin não encontrada.')

    let store = (lojas ?? []).find((item) => String(item.codigo) === String(note.codigo_cliente))
    if (!store) {
      store = await invoiceMutations.findStore.mutateAsync({ code: note.codigo_cliente, restrictedUfs })
    }
    if (!store) throw new Error('Não foi possível localizar a loja desta NFD.')

    await invoiceMutations.start.mutateAsync({ storeId: store.id, accessKey: String(note.chave_acesso) })

    const selectedNfd = {
      ...note,
      id: note.chave_acesso,
      numero: String(note.nota_fiscal),
      loja_id: store.id,
      loja_codigo: store.codigo,
      loja_nome: store.nome,
      nome_abreviado: store.nome,
      status_nfd: 'atrasada',
    }
    setSelectedNote(null)
    setSelectedFstd({ note: selectedNfd, store })
  }

  async function handleUnknownNote(note, comment) {
    const store = getStoreForNote(note)
    if (!store) throw new Error('Não foi possível localizar a loja desta NFD.')

    await invoiceMutations.markUnknown.mutateAsync({ store, note, comment })
    setSelectedNote((current) => current ? { ...current, status: 'Desconhecida' } : current)
  }

  async function handleRecognizeNote(note) {
    await invoiceMutations.recognize.mutateAsync(note)
    setSelectedNote((current) => current ? { ...current, status: 'Pendente' } : current)
  }

  function handleEditFinalizedNfd(note, store) {
    if (!canEditFinalized) return
    const editableNote = {
      ...note,
      status: 'Finalizada',
      status_nfd: 'finalizada',
    }

    setSelectedFinalized(null)
    setSelectedFstd({ note: editableNote, store, allowFinalizedEdit: true })
  }

  function handleFstdCompleted() {
    if (!selectedFstd?.note || !selectedFstd?.store) return

    const finalizedNote = {
      ...selectedFstd.note,
      status: 'Finalizada',
      status_nfd: 'finalizada',
    }

    void invoicesQuery.refetch()
    setCompletionMessage(`NFD ${finalizedNote.nota_fiscal ?? finalizedNote.numero} finalizada com sucesso.`)
    setSelectedFstd(null)
    setSelectedFinalized({ note: finalizedNote, store: selectedFstd.store })
  }

  function toggleFilterValue(setter, value) {
    setter((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
    setPageByDate({})
  }

  function clearFilters() {
    setSelectedStatuses([])
    setSelectedUfs([])
    setSelectedCities([])
    setPageByDate({})
  }

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
                onChange={(event) => {
                  onSearch(event.target.value)
                  setPageByDate({})
                }}
                placeholder="Procurar"
                type="search"
              />
            </label>

            <div className="filter-wrap">
              <button
                className={`filter-trigger ${isFilterOpen ? 'is-open' : ''}`}
                type="button"
                onClick={() => setFilterOpen((open) => !open)}
                aria-expanded={isFilterOpen}
                aria-haspopup="true"
              >
                <Icon name="filter" />
                <span>{activeFiltersCount ? `${activeFiltersCount} filtro${activeFiltersCount > 1 ? 's' : ''}` : 'Filtrar'}</span>
                <span className="select-chevron" />
              </button>

              {isFilterOpen && (
                <NotesFilterPopover
                  notes={notes}
                  selectedStatuses={selectedStatuses}
                  selectedUfs={selectedUfs}
                  selectedCities={selectedCities}
                  onToggleStatus={(value) => toggleFilterValue(setSelectedStatuses, value)}
                  onToggleUf={(value) => toggleFilterValue(setSelectedUfs, value)}
                  onToggleCity={(value) => toggleFilterValue(setSelectedCities, value)}
                  onClear={clearFilters}
                  onClose={() => setFilterOpen(false)}
                />
              )}
            </div>
          </div>
        </div>

        {completionMessage && (
          <p className="notes-completion-message" role="status">
            {completionMessage}
          </p>
        )}

        {loading && <p className="table-message">Carregando notas fiscais...</p>}

        {!loading && error && <p className="table-message">{error}</p>}

        {!loading && !error && filteredGroups.map((group) => (
          <section className="notes-date-group" key={group.date}>
            <h3>{group.date}</h3>

            <div className="notes-table" role="table" aria-label={`NFDs de ${group.date}`}>
              <div className="notes-row notes-head" role="row">
                <span role="columnheader">LOJA</span>
                <span role="columnheader">NFD</span>
                <span role="columnheader">STATUS</span>
              </div>

              {group.rows.map((row) => (
                <div
                  className="notes-row notes-row-interactive"
                  role="row"
                  key={`${group.key}-${row.key}`}
                  tabIndex="0"
                  onClick={() => handleSelectNote(row.note)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleSelectNote(row.note)
                    }
                  }}
                >
                  <span className="notes-store-cell" role="cell">
                    <NotaStatusIcon status={row.status} />
                    <strong>{row.loja}</strong>
                  </span>
                  <span role="cell">{row.nfd}</span>
                  <span role="cell">{row.status}</span>
                </div>
              ))}
            </div>

            <NotesPagination
              page={group.page}
              pages={group.pages}
              onChange={(nextPage) => setPageByDate((current) => ({ ...current, [group.key]: nextPage }))}
            />
          </section>
        ))}

        {!loading && !error && filteredGroups.length === 0 && (
          <p className="table-message">Nenhuma NFD encontrada.</p>
        )}
      </div>
      <NotaFiscalModal
        note={selectedNote}
        onClose={() => setSelectedNote(null)}
        onPending={handlePendingNote}
        onUnknown={handleUnknownNote}
        onRecognize={handleRecognizeNote}
      />
      <GerencialFstdModal
        note={selectedFstd?.note}
        store={selectedFstd?.store}
        allowFinalizedEdit={selectedFstd?.allowFinalizedEdit}
        onClose={() => setSelectedFstd(null)}
        onCompleted={handleFstdCompleted}
      />
      <GerencialFinalizedNfdModal
        note={selectedFinalized?.note}
        store={selectedFinalized?.store}
        onClose={() => setSelectedFinalized(null)}
        onEdit={canEditFinalized ? handleEditFinalizedNfd : undefined}
      />
    </section>
  )
}

function PlaceholderScreen({ title }) {
  return (
    <section className="users-card placeholder-card">
      <h2>{title}</h2>
      <p className="table-message">Módulo protegido para gerencial ativo.</p>
    </section>
  )
}

function GerencialApp({ capabilities }) {
  const navigate = useNavigate()
  const {
    session,
    profile: currentUser,
    loading: authLoading,
    signOut,
    refreshProfile,
  } = useAuth()
  const gerencialCapabilities = capabilities ?? {
    isAdmin: currentUser?.perfil === 'Admin' && currentUser?.auth_role === 'admin',
    isGerencial: currentUser?.perfil === 'Gerencial' && currentUser?.auth_role === 'gerencial',
    isScoped: isScopedGerencial(currentUser),
    allowedUfs: isScopedGerencial(currentUser) ? currentUser.ufs : [],
    canManageAllUsers: !isScopedGerencial(currentUser),
    canManageStores: currentUser?.perfil === 'Admin' && currentUser?.auth_role === 'admin',
  }
  const [isDesktop, setIsDesktop] = useState(() => typeof window === 'undefined' || window.innerWidth > 980)
  const [sidebarExpanded, setSidebarExpanded] = useState(() => typeof window === 'undefined' || window.innerWidth > 980)
  const [selectedItem, setSelectedItem] = useState(getInitialGerencialScreen)
  const [search, setSearch] = useState('')
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState('')
  const [isCadastroOpen, setCadastroOpen] = useState(false)
  const [isFilterOpen, setFilterOpen] = useState(false)
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
  const [gerencialEditId, setGerencialEditId] = useState('')
  const [gerencialEditForm, setGerencialEditForm] = useState({
    nome: '',
    email: '',
    senha: '',
    ativo: true,
  })
  const [gerencialBusy, setGerencialBusy] = useState(false)
  const [gerencialError, setGerencialError] = useState('')
  const [profilePhoto, setProfilePhoto] = useState('')

  useEffect(() => {
    function handleViewportChange() {
      const desktop = window.innerWidth > 980
      setIsDesktop(desktop)
      if (desktop) setSidebarExpanded(true)
    }

    window.addEventListener('resize', handleViewportChange)
    return () => window.removeEventListener('resize', handleViewportChange)
  }, [])

  useEffect(() => {
    if (!isAdministrativeProfile(currentUser)) return

    try {
      window.localStorage.setItem(gerencialScreenStorageKey, selectedItem)
    } catch {
      // A navegaÃ§Ã£o continua funcionando mesmo sem persistÃªncia local.
    }
  }, [currentUser, selectedItem])

  async function loadUsuarios() {
    setLoading(true)
    setError('')

    try {
      setUsuarios(await listManagedUsers())
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os usuários.')
      setUsuarios([])
    }

    setLoading(false)
  }

  async function loadLojas() {
    setLojasLoading(true)
    setLojasError('')
    const scopedUfs = gerencialCapabilities.allowedUfs

    const [lojasResult, usuariosResult, vinculosResult] = await Promise.all([
      listStores({ ufs: scopedUfs })
        .then((data) => ({ data, error: null }))
        .catch((error) => ({ data: [], error })),
      listManagedUsers()
        .then((data) => ({ data, error: null }))
        .catch((error) => ({ data: [], error })),
      supabase
        .from('loja_promotores')
        .select('id, loja_id, promotor_id, posicao')
        .order('posicao', { ascending: true }),
    ])

    const requestError = lojasResult.error || usuariosResult.error || vinculosResult.error

    if (requestError) {
      setLojasError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar as lojas.')
      setLojas([])
      setPromotores([])
      setLojaPromotores([])
    } else {
      setLojas(sortStoresByCode(lojasResult.data ?? []))
      setPromotores(
        (usuariosResult.data ?? []).filter(
          (usuario) => usuario.perfil === 'Promotor' && usuario.ativo,
        ),
      )
      const visibleStoreIds = new Set((lojasResult.data ?? []).map((loja) => loja.id))
      setLojaPromotores(
        (vinculosResult.data ?? []).filter((vinculo) => visibleStoreIds.has(vinculo.loja_id)),
      )
    }

    setLojasLoading(false)
  }

  async function loadOperationalData() {
    await Promise.all([loadUsuarios(), loadLojas()])
  }

  useEffect(() => {
    let isMounted = true

    async function bootstrapGerencial() {
      if (
        authLoading ||
        !session ||
        !isAdministrativeProfile(currentUser) ||
        currentUser.ativo !== true ||
        currentUser.acesso_habilitado !== true
      ) {
        return
      }

      if (currentUser.foto_url) {
        try {
          const signedPhoto = await getProfilePhotoSignedUrl(currentUser.foto_url)
          if (isMounted) setProfilePhoto(signedPhoto)
        } catch {
          if (isMounted) setProfilePhoto('')
        }
      } else if (isMounted) {
        setProfilePhoto('')
      }

      if (isMounted) await loadOperationalData()
    }

    void bootstrapGerencial()

    return () => {
      isMounted = false
    }
    // Operational data reloads when the centralized authenticated profile changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authLoading,
    currentUser?.acesso_habilitado,
    currentUser?.ativo,
    currentUser?.auth_user_id,
    currentUser?.auth_role,
    currentUser?.foto_url,
    currentUser?.perfil,
    session?.user?.id,
  ])

  const vinculosPorLoja = useMemo(() => {
    return lojaPromotores.reduce((acc, vinculo) => {
      if (!acc[vinculo.loja_id]) acc[vinculo.loja_id] = {}
      acc[vinculo.loja_id][vinculo.posicao] = vinculo.promotor_id ?? ''
      return acc
    }, {})
  }, [lojaPromotores])

  const isPerfil = selectedItem === 'perfil'
  const isLojas = selectedItem === 'lojas'
  const isUsuarios = selectedItem === 'usuarios'
  const isDashboard = selectedItem === 'dashboard'
  const isNotas = selectedItem === 'notas'
  const isMotivos = selectedItem === 'motivos'
  const isRecolhimento = selectedItem === 'recolhimento'
  const isRelatorios = selectedItem === 'relatorios'
  const pageTitle = isPerfil
    ? 'Perfil'
    : isLojas
    ? 'Lojas'
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
            : 'Cadastro de Usuários'
  const pageSubtitle = isPerfil
     ? `Dados da conta ${getManagedRoleLabel(currentUser)}.`
    : isLojas
    ? 'Roteirização dos promotores.'
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
            : 'Gerencie todos os usuários do sistema.'
  const heroIcon = isPerfil
    ? 'users'
    : isLojas
    ? 'pin'
    : isNotas || isMotivos
          ? 'notes'
          : isRecolhimento
            ? 'logs'
        : isRelatorios || isDashboard
          ? 'chart'
          : 'user-plus'

  async function handleCreateUsuario(event) {
    event.preventDefault()

    const canCreateSelectedProfile = form.perfil === 'Promotor'
      ? can(currentUser, 'users.managePromoters')
      : can(currentUser, 'users.manageGerencial')
    if (!canCreateSelectedProfile) {
      setFormError('Seu perfil não pode cadastrar este tipo de usuário.')
      return
    }

    if (form.perfil === 'Admin' && !isScopedGerencial(currentUser)) {
      const gerencialPayload = {
        nome: normalizaTexto(form.nome),
        email: form.email.trim().toLowerCase(),
        password: form.senha,
        auth_role: form.auth_role,
      }

      if (
        gerencialPayload.nome.length < 4 ||
        !emailPattern.test(gerencialPayload.email) ||
        getPasswordValidationMessage(gerencialPayload.password)
      ) {
        setFormError('Revise nome, email e senha antes de criar.')
        return
      }

      setSaving(true)
      setFormError('')

      try {
        await createGerencialUser(gerencialPayload)
      } catch (createError) {
        setFormError(createError instanceof Error ? createError.message : 'Não foi possível criar o Admin.')
        setSaving(false)
        return
      }

      setForm(initialUserForm)
      setCadastroOpen(false)
      setSaving(false)
      await loadUsuarios()
      return
    }

    const restrictedUfs = isScopedGerencial(currentUser) ? currentUser.ufs : []
    const payload = {
      email: form.email.trim().toLowerCase(),
      nome: form.nome.trim().toUpperCase(),
      password: form.senha,
      perfil: form.perfil,
      estado: form.ufs?.[0] ?? form.estado,
      ufs: form.perfil === 'Admin' ? [] : form.ufs,
      fotos_habilitadas: form.fotos_habilitadas,
    }

    if (
      !emailPattern.test(payload.email) ||
      payload.nome.length < 4 ||
      getPasswordValidationMessage(payload.password) ||
      isNomeDuplicado(payload.nome, usuarios) ||
      !perfisCadastro.includes(payload.perfil) ||
      (restrictedUfs.length ? !restrictedUfs.includes(payload.estado) : payload.perfil !== 'Admin' && !payload.ufs.every((uf) => estados.includes(uf))) ||
      (isScopedGerencial(currentUser) && payload.perfil !== 'Promotor')
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
    if (!can(currentUser, 'stores.create')) {
      setLojaFormError('Apenas Admin pode cadastrar lojas.')
      return
    }

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
      !estadosLojas.includes(payload.uf) ||
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

    try {
      await updateManagedUser({
        usuario_id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        estado: usuario.estado,
        ufs: usuario.ufs ?? [usuario.estado],
        fotos_habilitadas: nextValue,
        ativo: usuario.ativo,
        acesso_habilitado: usuario.acesso_habilitado,
      })
      setUsuarios((current) =>
        current
          .map((item) => (item.id === usuario.id ? { ...item, fotos_habilitadas: nextValue } : item))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      )
      setSelectedUsuario((current) =>
        current?.id === usuario.id ? { ...current, fotos_habilitadas: nextValue } : current,
      )
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Não foi possível atualizar o usuário.')
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
      ufs: selectedUsuario.ufs ?? [selectedUsuario.estado],
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
      ufs: [editForm.estado],
      fotos_habilitadas: editForm.fotos_habilitadas,
      ...(editForm.senha ? { password: editForm.senha } : {}),
    }

    if (
      !emailPattern.test(payload.email) ||
      payload.nome.length < 4 ||
      isNomeDuplicado(payload.nome, usuarios, selectedUsuario.id) ||
      getPasswordValidationMessage(editForm.senha, { optional: true }) ||
      !perfisEditaveis.includes(payload.perfil) ||
      (isScopedGerencial(currentUser)
        ? !currentUser.ufs.includes(payload.estado)
        : !estados.includes(payload.estado)) ||
      (isScopedGerencial(currentUser) && payload.perfil !== 'Promotor')
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

    try {
      await updateManagedUser({
        usuario_id: selectedUsuario.id,
        ...payload,
        ativo: selectedUsuario.ativo,
        acesso_habilitado: selectedUsuario.acesso_habilitado,
      })
    } catch (updateError) {
      setEditError(
        updateError instanceof Error ? updateError.message : 'Não foi possível atualizar o usuário.',
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

    const shouldBlock = window.confirm(
      `Bloquear o acesso de ${selectedUsuario.nome}? O perfil operacional será preservado.`,
    )
    if (!shouldBlock) return

    setDeletingUser(true)
    setEditError('')

    try {
      await setManagedUserAccess(selectedUsuario.id, false, false)
    } catch (blockError) {
      setEditError(blockError instanceof Error ? blockError.message : 'Não foi possível bloquear o usuário.')
      setDeletingUser(false)
      return
    }

    setDeletingUser(false)
    closeUserModals()
    await loadUsuarios()
    await loadLojas()
  }

  async function handleLogout() {
    await signOut()
    setProfilePhoto('')
    setSelectedItem('lojas')
    setUsuarios([])
    setLojas([])
    setPromotores([])
    setLojaPromotores([])
    navigate('/', { replace: true })
  }

  function startEditGerencial(usuario) {
    setGerencialEditId(usuario.id)
    setGerencialEditForm({
      nome: usuario.nome,
      email: usuario.email,
      senha: '',
      ativo: usuario.ativo,
    })
    setGerencialError('')
  }

  function cancelEditGerencial() {
    setGerencialEditId('')
    setGerencialEditForm({ nome: '', email: '', senha: '', ativo: true })
    setGerencialError('')
  }

  async function handleSaveGerencial() {
    const payload = {
      usuario_id: gerencialEditId,
      nome: normalizaTexto(gerencialEditForm.nome),
      email: gerencialEditForm.email.trim().toLowerCase(),
      senha: gerencialEditForm.senha,
      ativo: gerencialEditForm.ativo,
    }

    if (
      !payload.usuario_id
      || payload.nome.length < 4
      || !emailPattern.test(payload.email)
      || getPasswordValidationMessage(payload.senha, { optional: true })
    ) {
      setGerencialError('Revise nome, email e a nova senha antes de salvar.')
      return
    }

    setGerencialBusy(true)
    setGerencialError('')

    const target = usuarios.find((usuario) => usuario.id === gerencialEditId)
    if (!target) {
      setGerencialError('Admin não encontrado.')
      setGerencialBusy(false)
      return
    }

    let data
    try {
      data = await updateManagedUser({
        usuario_id: target.id,
        nome: payload.nome,
        email: payload.email,
        perfil: target.perfil === 'Admin' ? 'Admin' : 'Gerencial',
        estado: target.estado,
        ufs: target.ufs ?? (target.perfil === 'Admin' ? [] : [target.estado]),
        fotos_habilitadas: target.fotos_habilitadas,
        ativo: payload.ativo,
        acesso_habilitado: payload.ativo,
        auth_role: target.perfil === 'Admin' ? 'admin' : 'gerencial',
        password: payload.senha || undefined,
      })
    } catch (updateError) {
      setGerencialError(updateError instanceof Error ? updateError.message : 'Não foi possível editar o Admin.')
      setGerencialBusy(false)
      return
    }

    if (data.auth_user_id === currentUser?.auth_user_id) {
      await refreshProfile()
    }

    cancelEditGerencial()
    setGerencialBusy(false)
    await loadUsuarios()
  }

  async function handleDeleteGerencial(usuario) {
    const shouldDelete = window.confirm(
      `Excluir ${usuario.nome} (${usuario.email})? A conta de acesso e o perfil serão removidos definitivamente.`,
    )
    if (!shouldDelete) return

    setGerencialBusy(true)
    setGerencialError('')

    try {
      await deleteManagedUser(usuario.id)
    } catch (deleteError) {
      setGerencialError(deleteError instanceof Error ? deleteError.message : 'Não foi possível excluir o Admin.')
      setGerencialBusy(false)
      return
    }

    setGerencialBusy(false)
    await loadUsuarios()
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

    await refreshProfile()

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

  return (
    <GerencialApplicationShell
      authLoading={authLoading}
      session={session}
      profile={currentUser}
      sidebar={<Sidebar
        expanded={sidebarExpanded}
        canCollapse={!isDesktop}
        selectedItem={selectedItem}
        currentUser={currentUser}
        profilePhoto={profilePhoto}
        onLogout={handleLogout}
        onSelect={handleSelectItem}
        onToggle={() => setSidebarExpanded((open) => !open)}
      />}
    >

      <main className={`workspace ${sidebarExpanded ? 'sidebar-open' : ''} ${isUsuarios ? 'registration-workspace' : ''}`}>
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
        ) : isUsuarios ? (
          <UsuariosScreen
            currentUser={currentUser}
            usuarios={usuarios}
            loading={loading}
            error={error || gerencialError}
            busy={gerencialBusy}
            editId={gerencialEditId}
            editForm={gerencialEditForm}
            search={search}
            onSearch={setSearch}
            onOpenCadastro={() => setCadastroOpen(true)}
            onOpenUsuario={openInfoModal}
            onEditChange={(patch) => setGerencialEditForm((current) => ({ ...current, ...patch }))}
            onStartEdit={startEditGerencial}
            onCancelEdit={cancelEditGerencial}
            onSaveEdit={handleSaveGerencial}
            onDelete={handleDeleteGerencial}
            restrictedUfs={gerencialCapabilities.allowedUfs}
          />
        ) : isRelatorios ? (
          <ReportScreen />
        ) : isNotas ? (
          <NotasScreen
            search={search}
            onSearch={setSearch}
            lojas={lojas}
            currentUser={currentUser}
            restrictedUfs={gerencialCapabilities.allowedUfs}
            canEditFinalized={can(currentUser, 'fstd.editFinalized')}
          />
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
            onOpenCadastro={() => gerencialCapabilities.canManageStores && setCadastroOpen(true)}
            onChangePromotor={handlePromotorChange}
            canCreateStore={gerencialCapabilities.canManageStores}
          />
        ) : (
          <PlaceholderScreen title={pageTitle} />
        )}
      </main>

      {isCadastroOpen && isUsuarios && (
        <CadastroModal
          form={form}
          usuarios={usuarios}
          currentUser={currentUser}
          busy={saving}
          error={formError}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          onClose={closeCadastro}
          onSubmit={handleCreateUsuario}
        />
      )}

      {isCadastroOpen && isLojas && gerencialCapabilities.canManageStores && (
        <CadastroLojaModal
          form={lojaForm}
          lojas={lojas}
          allowedStates={isScopedGerencial(currentUser)
              ? [currentUser.estado]
              : estadosLojas}
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
          canManage={selectedUsuario.perfil === 'Promotor'
            ? can(currentUser, 'users.managePromoters')
            : can(currentUser, 'users.manageGerencial')}
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

    </GerencialApplicationShell>
  )
}

export default GerencialApp
