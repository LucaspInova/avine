import { useEffect, useMemo, useRef, useState } from 'react'
import { useInvoiceMutations, useInvoices } from '../../domains/invoices'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../domains/auth/AuthProvider.jsx'
import { can } from '../../domains/auth/model/capabilities'
import { supabase } from '../../shared/lib/supabaseClient'
import {
  createGerencialUser,
  createOperationalUser,
  deleteManagedUser,
  getUserActivityStatus,
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
import { ManagementDashboard } from './features/dashboard/ManagementDashboard.jsx'
import { AttachedPhotosScreen } from './features/attached-photos/AttachedPhotosScreen.jsx'
import { GerencialApplicationShell } from './features/shell/GerencialApplicationShell.jsx'
import avineLogo from '../../shared/assets/foto_logoavine.png'
import profileUserIcon from '../../shared/assets/ui-icons/do-utilizador.png'
import pdfIcon from '../../shared/assets/ui-icons/arquivo-pdf.png'
import LogoutConfirmDialog from '../../shared/components/LogoutConfirmDialog.jsx'
import { AppSelect, FilterPopover, FilterSection, LoadingState, PageToolbar, Pagination } from '../../shared/ui'
import {
  getGerencialScreenFromPath,
  getGerencialScreenPath,
  getGerencialSearch,
  isCanonicalGerencialPath,
  setGerencialSearch,
} from './navigation'
import { gerencialNavItems, getGerencialScreenMetadata } from './screenMetadata'
import './GerencialApp.css'

const estados = ['CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL']
const estadosLojas = [...estados, 'TO']
const perfisCadastro = ['Admin', 'Gerencial', 'Promotor']
const perfisEditaveis = ['Admin', 'Gerencial', 'Promotor']
const perfisCadastroUi = [
  { value: 'Admin', label: 'Admin', authRole: 'admin' },
  { value: 'Gerencial', label: 'Gerencial', authRole: 'gerencial' },
  { value: 'Promotor', label: 'Promotor', authRole: 'promotor' },
]
const emptyPromotorSlots = [1, 2, 3]
const USERS_PAGE_SIZE = 10
const DEFAULT_PROMOTER_PASSWORD = 'Promotor12345'

const supportWhatsappMessage = 'Olá! Preciso de suporte na plataforma Avine.'
const supportWhatsappUrl = `https://wa.me/5585986532599?text=${encodeURIComponent(supportWhatsappMessage)}`

const initialUserForm = {
  email: '',
  nome: '',
  senha: '',
  perfil: '',
  auth_role: 'admin',
  estado: '',
  ufs: [],
}

const initialLojaForm = {
  codigo: '',
  nome: '',
  uf: '',
  cidade: '',
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isAdministrativeProfile(user) {
  return user?.perfil === 'Admin' || user?.perfil === 'Gerencial'
}

function isScopedGerencial(user) {
  return user?.perfil === 'Gerencial' && user.auth_role === 'gerencial'
}

function getUserUfLabel(user, emptyLabel = '-') {
  if (user?.perfil === 'Admin') return 'Todas'

  const ufs = Array.isArray(user?.ufs) ? user.ufs : []
  const assignedUfs = new Set(
    ufs.map((uf) => String(uf).trim().toUpperCase()).filter(Boolean),
  )
  const hasAllUfs = ['Gerencial', 'Promotor'].includes(user?.perfil) && estados.every((uf) => assignedUfs.has(uf))

  if (hasAllUfs) return 'Todas'
  return ufs.length ? ufs.join(', ') : user?.estado || emptyLabel
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

const notePercentageFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function formatNotePercentage(value, total) {
  return notePercentageFormatter.format(total === 0 ? 0 : value / total)
}

function getNoteDateKey(note) {
  return String(note.data_referencia ?? note.data_emissao ?? '').slice(0, 10) || 'sem-data'
}

const NOTE_SORT_COLUMNS = [
  {
    key: 'loja',
    label: 'LOJA',
    select: (note) => note.nome_abreviado?.trim() || note.estabelecimento?.trim() || String(note.codigo_cliente ?? '-'),
    type: 'text',
  },
  { key: 'nota_fiscal', label: 'NFD', select: (note) => note.nota_fiscal, type: 'number' },
  {
    key: 'data_emissao',
    label: 'EMISSÃO',
    select: (note) => String(note.data_emissao ?? note.data_referencia ?? '').slice(0, 10),
    type: 'date',
  },
  { key: 'uf', label: 'UF', select: (note) => note.uf, type: 'text' },
  { key: 'status', label: 'STATUS', select: (note) => note.status, type: 'text' },
]

function getDefaultNoteDates(now = new Date()) {
  const localDate = (date) => {
    const offset = date.getTimezoneOffset() * 60000
    return new Date(date.getTime() - offset).toISOString().slice(0, 10)
  }
  return { start: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: localDate(now) }
}


function normalizaNome(nome) {
  return nome.trim().replace(/\s+/g, ' ').toUpperCase()
}

function normalizaTexto(texto) {
  return texto.trim().replace(/\s+/g, ' ')
}

function normalizaPesquisa(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function isNomeDuplicado(nome, usuarios, ignoredId = '') {
  const nomeNormalizado = normalizaNome(nome)

  if (!nomeNormalizado) return false

  return usuarios.some(
    (usuario) => usuario.id !== ignoredId && normalizaNome(usuario.nome) === nomeNormalizado,
  )
}

function isEmailDuplicado(email, usuarios, ignoredId = '') {
  const normalizedEmail = String(email ?? '').trim().toLowerCase()
  return normalizedEmail.length > 0 && usuarios.some((usuario) =>
    usuario.id !== ignoredId && String(usuario.email ?? '').trim().toLowerCase() === normalizedEmail)
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
      <svg {...props} strokeWidth="1.5">
        <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    )
  }

  if (name === 'headset') {
    return (
      <svg {...props}>
        <path d="M4 13a8 8 0 0 1 16 0" />
        <path d="M4 13v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2Z" />
        <path d="M20 13v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z" />
        <path d="M17 18a5 5 0 0 1-5 3h-1" />
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
      <svg {...props} strokeWidth="1.5">
        <path d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
        <path d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
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

export function Sidebar({ isMobile = false, expanded, canCollapse, selectedItem, currentUser, profilePhoto, onLogout, onClose, onToggle, onSelect }) {
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

  useEffect(() => {
    if (!isMobile || !expanded) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [expanded, isMobile, onClose])

  return (
    <>
      {isMobile && expanded && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Fechar menu principal"
          onClick={onClose}
        />
      )}
      <aside
        id="gerencial-main-navigation"
        className={`sidebar ${isMobile ? 'is-mobile' : ''} ${expanded ? 'is-expanded' : 'is-collapsed'}`}
        role={isMobile ? 'dialog' : undefined}
        aria-label={isMobile ? 'Menu principal' : undefined}
        aria-modal={isMobile || undefined}
        aria-hidden={isMobile && !expanded}
      >
      <div className="sidebar-brand">
        <button className="brand-button" type="button" aria-label={`Avine ${profileRole}`}>
          <img className="brand-logo" src={avineLogo} alt="Avine" />
        </button>

        {isMobile ? (
          <button
            className="sidebar-close"
            type="button"
            aria-label="Fechar menu principal"
            onClick={onClose}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        ) : canCollapse && (
          <button
            className="sidebar-toggle"
            type="button"
            onClick={onToggle}
            aria-label={expanded ? 'Recolher sidebar' : 'Expandir sidebar'}
          >
            <svg className="sidebar-toggle-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>

      <nav className="sidebar-nav" aria-label="Menu principal">
          {gerencialNavItems.map((item) => (
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

      <a
        className="sidebar-support"
        href={supportWhatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Suporte"
      >
        <Icon name="headset" />
        <span className="sidebar-label">Suporte</span>
      </a>

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
    </>
  )
}

export function UsuarioModal({
  mode = 'create', form, usuarios, currentUser, usuarioId = '', busy, deleting = false, error,
  onChange, onBack, onClose, onSubmit, onDelete, onToggleAccess, accessBusy = false,
  accessEnabled = true, canToggleAccess = true, deleteConfirmationOpen = false,
  onCancelDelete, allowedProfiles = perfisCadastro,
}) {
  const [touched, setTouched] = useState({})
  const isEdit = mode === 'edit'
  const touch = (field) => setTouched((current) => ({ ...current, [field]: true }))
  const trimmedEmail = form.email.trim()
  const trimmedName = form.nome.trim()
  const password = form.senha ?? ''
  const isAdmin = form.perfil === 'Admin'
  const isGerencial = form.perfil === 'Gerencial'
  const isPromotor = form.perfil === 'Promotor'
  const currentUserIsGerencial = isScopedGerencial(currentUser)
  const availableProfiles = allowedProfiles.filter((profile) => !currentUserIsGerencial || profile === 'Promotor')
  const allowedStates = currentUserIsGerencial ? currentUser.ufs : estados
  const isEmailValid = emailPattern.test(trimmedEmail)
  const hasEmailDuplicado = isEmailDuplicado(trimmedEmail, usuarios, usuarioId)
  const isNameValid = trimmedName.length >= 4
  const hasNomeDuplicado = isNomeDuplicado(trimmedName, usuarios, usuarioId)
  const passwordError = getPasswordValidationMessage(password, { optional: isEdit })
  const isPasswordValid = (!isEdit && isPromotor) || !passwordError
  const isProfileValid = availableProfiles.includes(form.perfil)
  const selectedUfs = isAdmin ? allowedStates : (form.ufs ?? (form.estado ? [form.estado] : []))
  const isEstadoValid = isAdmin || (isGerencial
    ? selectedUfs.length > 0 && selectedUfs.every((uf) => allowedStates.includes(uf))
    : selectedUfs.length === 1 && allowedStates.includes(selectedUfs[0]))
  const canSubmit = isEmailValid && !hasEmailDuplicado && isNameValid && !hasNomeDuplicado &&
    isPasswordValid && isProfileValid && isEstadoValid && !busy && !deleting && !accessBusy

  const feedback = (field, valid, validText, invalidText) => touched[field] && (
    <strong className={valid ? 'field-success' : 'field-error'}>{valid ? validText : invalidText}</strong>
  )

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="user-modal" onSubmit={onSubmit}>
        <div className="modal-titlebar">
          {isEdit && <button className="back-button" type="button" onClick={onBack} aria-label="Voltar"><Icon name="arrow-left" /></button>}
          <h3>{isEdit ? 'Editar Usuário' : 'Cadastrar Usuário'}</h3>
          <button className="icon-button" type="button" onClick={onClose} aria-label={isEdit ? 'Fechar edição' : 'Fechar cadastro'}><Icon name="x" /></button>
        </div>
        <div className="modal-grid user-registration-modal-grid">
          <div className="modal-main">
            <div className="user-profile-field">
              <fieldset>
                <legend>Perfil</legend>
                <div className="chip-group">
                  {perfisCadastroUi.filter(({ value }) => availableProfiles.includes(value)).map((profile) => (
                    <button key={profile.value} className={`choice-chip ${form.perfil === profile.value ? 'is-selected' : ''}`}
                      type="button" onClick={() => {
                        touch('perfil')
                        const perfil = form.perfil === profile.value ? '' : profile.value
                        const nextUfs = perfil === 'Admin' ? allowedStates : []
                        onChange({ perfil, auth_role: perfil ? profile.authRole : '', ufs: nextUfs, estado: nextUfs[0] ?? '' })
                      }}>{profile.label}</button>
                  ))}
                </div>
              </fieldset>
              {feedback('perfil', isProfileValid, 'Perfil válido.', 'Escolha um perfil.')}
            </div>
            <label className="form-row"><span>Nome</span>
              <input value={form.nome} onChange={(event) => onChange({ nome: event.target.value.toUpperCase() })} onBlur={() => touch('nome')}
                minLength={4} placeholder="Digite o nome completo" type="text" required />
              {feedback('nome', isNameValid && !hasNomeDuplicado, 'Nome válido.', hasNomeDuplicado ? 'Nome já usado; inclua um sobrenome.' : 'Use pelo menos 4 letras maiúsculas.')}
            </label>
            <label className="form-row"><span>E-mail</span>
              <input className={touched.email && (!isEmailValid || hasEmailDuplicado) ? 'is-invalid' : ''} value={form.email}
                onChange={(event) => onChange({ email: event.target.value })} onBlur={() => touch('email')} placeholder="nome@empresa.com" type="email" required />
              {feedback('email', isEmailValid && !hasEmailDuplicado, 'E-mail válido.', hasEmailDuplicado ? 'E-mail já usado; insira outro ou edite o usuário.' : 'Insira um e-mail válido.')}
            </label>
            {(!isPromotor || isEdit) ? <label className="form-row"><span>{isEdit ? 'Nova senha (opcional)' : 'Senha'}</span>
              <input className={touched.senha && !isPasswordValid ? 'is-invalid' : ''} value={password} onChange={(event) => onChange({ senha: event.target.value })}
                onBlur={() => touch('senha')} minLength={PASSWORD_MIN_LENGTH} placeholder={isEdit ? 'Deixe vazio para manter' : `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
                type="password" autoComplete="new-password" required={!isEdit} />
              {feedback('senha', isPasswordValid, isEdit && !password ? 'Senha atual será mantida.' : 'Senha válida.', passwordError?.replace(/^A senha/, isEdit ? 'A nova senha' : 'A senha'))}
            </label> : <p className="field-success promoter-password-note">Senha padrão definida automaticamente.</p>}
            <div className="user-state-field">
              <fieldset>
                <legend>UF</legend>
                <div className="chip-group state-chips">
                  {allowedStates.map((uf) => <button key={uf} className={`choice-chip ${selectedUfs.includes(uf) ? 'is-selected' : ''}`} type="button"
                    disabled={!form.perfil || isAdmin} onClick={() => {
                      touch('estado')
                      const nextUfs = isGerencial ? (selectedUfs.includes(uf) ? selectedUfs.filter((item) => item !== uf) : [...selectedUfs, uf]) : (selectedUfs.includes(uf) ? [] : [uf])
                      onChange({ ufs: nextUfs, estado: nextUfs[0] ?? '' })
                    }}>{uf}</button>)}
                </div>
              </fieldset>
              {touched.estado && form.perfil && feedback('estado', isEstadoValid, isAdmin ? 'Todas as UFs (seleção obrigatória).' : isGerencial ? 'Múltiplas UFs permitidas.' : 'Uma UF selecionada.', isGerencial ? 'Escolha uma ou mais UFs.' : 'Escolha uma única UF.')}
            </div>
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        {isEdit ? <div className="edit-actions">
          <button className="danger-button" type="button" onClick={onDelete} disabled={busy || deleting}>Excluir acesso</button>
          <button
            className={accessEnabled ? 'warning-button' : 'reactivate-button'}
            type="button"
            onClick={onToggleAccess}
            disabled={busy || deleting || accessBusy || !canToggleAccess}
          >
            {accessBusy ? 'Alterando...' : accessEnabled ? 'Desativar acesso' : 'Reativar acesso'}
          </button>
          <button className="primary-button edit-submit" type="submit" disabled={!canSubmit}>{busy ? 'Salvando...' : 'Salvar'}</button>
        </div> : <button className="modal-submit" type="submit" disabled={!canSubmit}><Icon name="plus" /><span>{busy ? 'Cadastrando...' : 'Cadastrar'}</span></button>}
      </form>
      {deleteConfirmationOpen && <div className="confirmation-backdrop" role="presentation">
        <section className="delete-access-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-access-title">
          <div className="delete-access-icon" aria-hidden="true">!</div>
          <h3 id="delete-access-title">Excluir acesso?</h3>
          <p>Esta ação não pode ser desfeita. Se a exclusão estiver errada, será necessário cadastrar o funcionário novamente.</p>
          <div className="delete-confirm-actions">
            <button className="secondary-button" type="button" onClick={onCancelDelete} disabled={deleting}>Voltar</button>
            <button className="danger-button" type="button" onClick={onDelete} disabled={deleting}>{deleting ? 'Excluindo...' : 'Confirmar exclusão'}</button>
          </div>
        </section>
      </div>}
    </div>
  )
}

export function CadastroModal(props) {
  return <UsuarioModal {...props} mode="create" />
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

export function InformacoesUsuarioModal({ usuario, lojas = [], onClose, onEdit, canManage = true }) {
  const [storeSearch, setStoreSearch] = useState('')
  if (!usuario) return null
  const query = storeSearch.trim().toLocaleLowerCase('pt-BR')
  const visibleStores = lojas.filter((loja) => !query
    || `${loja.codigo} ${loja.nome} ${loja.uf}`.toLocaleLowerCase('pt-BR').includes(query))

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

          <dl className="info-data">
            <div>
              <dt>Perfil de Acesso</dt>
              <dd>{getManagedRoleLabel(usuario)}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{getUserUfLabel(usuario, 'Escopo global')}</dd>
            </div>
            <div>
              <dt>Acesso</dt>
              <dd>{usuario.ativo && usuario.acesso_habilitado ? 'Habilitado' : 'Desativado'}</dd>
            </div>
          </dl>
        </div>

        {usuario.perfil === 'Promotor' && lojas.length > 0 && (
          <section className="user-routing-panel" aria-label="Roteirização do promotor">
            <div className="stores-toolbar">
              <h3>Lojas</h3>
              <label className="stores-search">
                <Icon name="search" />
                <input type="search" value={storeSearch} onChange={(event) => setStoreSearch(event.target.value)} placeholder="Procurar" aria-label="Procurar loja atribuída" />
              </label>
            </div>
            <div className="user-routing-grid">
              {visibleStores.map((loja) => (
                <article className="store-card" key={loja.id}>
                  <strong>{loja.codigo} - {loja.uf}</strong>
                  <span>{loja.nome}</span>
                </article>
              ))}
            </div>
            {visibleStores.length === 0 && <p className="table-message">Nenhuma loja encontrada.</p>}
          </section>
        )}
      </div>
    </div>
  )
}

export function EditarUsuarioModal(props) {
  return <UsuarioModal {...props} mode="edit" />
}

export function PromotorSelect({ value, promotores, disabled, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selectedPromotor = promotores.find((promotor) => promotor.id === value)
  const filteredPromotores = useMemo(() => {
    const normalizedQuery = normalizaPesquisa(query)

    return promotores
      .filter((promotor) => !promotor.perfil || promotor.perfil === 'Promotor')
      .filter((promotor) => !normalizedQuery || normalizaPesquisa(promotor.nome).includes(normalizedQuery))
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
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            setIsOpen(false)
            setQuery('')
          } else if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setIsOpen(true)
          }
        }}
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
      [...new Set(lojas
        .filter((loja) => selectedUfs.length === 0 || selectedUfs.includes(loja.uf))
        .map((loja) => loja.cidade)
        .filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [lojas, selectedUfs],
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
  function handleToggleUf(estado) {
    const nextUfs = selectedUfs.includes(estado)
      ? selectedUfs.filter((item) => item !== estado)
      : [...selectedUfs, estado]
    const validCities = new Set(lojas
      .filter((loja) => nextUfs.length === 0 || nextUfs.includes(loja.uf))
      .map((loja) => loja.cidade)
      .filter(Boolean))

    selectedCidades
      .filter((cidade) => !validCities.has(cidade))
      .forEach(onToggleCidade)
    onToggleUf(estado)
  }

  return (
    <section className="stores-page">
      <PageToolbar
        className="stores-page-toolbar"
        title="Lojas"
        search={{ value: search, onChange: onSearch, placeholder: 'Procurar', label: 'Procurar lojas' }}
      >
        <FilterPopover
          activeFilterCount={activeFilterCount}
          isOpen={isFilterOpen}
          onToggle={onToggleFilter}
          onApply={onCloseFilters}
          onClear={onClearFilters}
        >
          <FilterSection title="Filtrar por UF" count={selectedUfs.length} id="store-filter-uf-options">
            <div className="filter-options">
              {estadosLojas.map((estado) => (
                <label key={estado} className="filter-option">
                  <span>{estado}</span>
                  <input checked={selectedUfs.includes(estado)} onChange={() => handleToggleUf(estado)} type="checkbox" />
                </label>
              ))}
            </div>
          </FilterSection>
          <FilterSection title="Filtrar por Cidade" count={selectedCidades.length} id="store-filter-city-options">
            <div className="filter-options">
              {cidades.map((cidade) => (
                <label key={cidade} className="filter-option">
                  <span>{cidade}</span>
                  <input checked={selectedCidades.includes(cidade)} onChange={() => onToggleCidade(cidade)} type="checkbox" />
                </label>
              ))}
              {cidades.length === 0 && <p className="filter-empty">Nenhuma cidade cadastrada.</p>}
            </div>
          </FilterSection>
        </FilterPopover>

        <div className="toolbar-actions">
          {canCreateStore && (
            <button className="create-button" type="button" onClick={onOpenCadastro}>
              <Icon name="plus" />
              <span>Cadastrar Loja</span>
            </button>
          )}
        </div>
      </PageToolbar>

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
  usuarios,
  lojaPromotores = [],
  loading,
  error,
  search,
  onSearch,
  onOpenCadastro,
  onOpenUsuario,
  restrictedUfs = [],
}) {
  const [profileFilter, setProfileFilter] = useState('all')
  const [ufFilter, setUfFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [page, setPage] = useState(1)
  const counts = useMemo(() => ({
    all: usuarios.length,
    Admin: usuarios.filter((usuario) => getManagedRoleKey(usuario) === 'Admin').length,
    Gerencial: usuarios.filter((usuario) => getManagedRoleKey(usuario) === 'Gerencial').length,
    Promotor: usuarios.filter((usuario) => usuario.perfil === 'Promotor').length,
  }), [usuarios])
  const statusCounts = useMemo(() => usuarios.reduce((summary, usuario) => {
    summary[getUserActivityStatus(usuario)] += 1
    return summary
  }, { active: 0, offline: 0, inactive: 0, blocked: 0 }), [usuarios])
  const availableUfs = useMemo(
    () => [...new Set(usuarios.map((usuario) => usuario.estado).filter((uf) =>
      uf && (restrictedUfs.length === 0 || restrictedUfs.includes(uf))))]
      .sort((first, second) => first.localeCompare(second, 'pt-BR')),
    [restrictedUfs, usuarios],
  )
  const storeCountByPromotor = useMemo(() => lojaPromotores.reduce((counts, vinculo) => {
    counts.set(vinculo.promotor_id, (counts.get(vinculo.promotor_id) ?? 0) + 1)
    return counts
  }, new Map()), [lojaPromotores])
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return usuarios.filter((usuario) => {
      const matchesSearch = !query || `${usuario.nome} ${usuario.email}`.toLowerCase().includes(query)
      const matchesProfile = profileFilter === 'all' || getManagedRoleKey(usuario) === profileFilter
      const matchesScope = restrictedUfs.length === 0 || restrictedUfs.includes(usuario.estado)
      const matchesUf = matchesScope && (restrictedUfs.length === 1 || ufFilter === 'all' || usuario.estado === ufFilter)
      const matchesStatus = statusFilter === 'all' || getUserActivityStatus(usuario) === statusFilter

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

  const canChooseUf = restrictedUfs.length !== 1
  const ufFilterCount = Number(canChooseUf && ufFilter !== 'all')
  const statusFilterCount = Number(statusFilter !== 'all')
  const activeFilterCount = ufFilterCount + statusFilterCount

  function handleClearFilters() {
    setUfFilter('all')
    setStatusFilter('all')
    setPage(1)
  }

  return (
    <section className="users-card user-registration-card">
      <PageToolbar
        className="users-page-toolbar"
        title="Usuários"
        search={{
          value: search,
          onChange: (value) => { onSearch(value); setPage(1) },
          placeholder: 'Procurar',
          label: 'Procurar usuários por nome ou e-mail',
        }}
      >
        <FilterPopover
          activeFilterCount={activeFilterCount}
          isOpen={isFilterOpen}
          onToggle={setIsFilterOpen}
          onApply={() => setIsFilterOpen(false)}
          onClear={handleClearFilters}
        >
          <FilterSection title="UF" count={ufFilterCount} id="user-filter-uf">
            {canChooseUf ? (
              <AppSelect
                aria-label="UF"
                searchable
                value={ufFilter}
                onChange={(event) => { setUfFilter(event.target.value); setPage(1) }}
              >
                <option value="all">Todas</option>
                {availableUfs.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </AppSelect>
            ) : <p className="filter-empty">UF de acesso: {restrictedUfs[0]}</p>}
          </FilterSection>
          <FilterSection title="Status" count={statusFilterCount} id="user-filter-status">
            <AppSelect
              aria-label="Status"
              value={statusFilter}
              onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}
            >
              <option value="all">Todos</option>
              <option value="active">Ativo</option>
              <option value="offline">Off-Line</option>
              <option value="inactive">Inativo</option>
              <option value="blocked">Desativado</option>
            </AppSelect>
          </FilterSection>
        </FilterPopover>

        <div className="toolbar-actions">
          <button className="create-button user-create-button" type="button" onClick={onOpenCadastro}>
            <Icon name="plus" />
            <span>Cadastrar Usuário</span>
          </button>
        </div>
      </PageToolbar>

      <section className="user-status-summary" aria-label="Resumo de usuários">
        {[
          { key: 'total', label: 'Total', total: usuarios.length, helper: 'Todos os usuários cadastrados no sistema.' },
          { key: 'active', label: 'Ativo', total: statusCounts.active, helper: 'Usuários cujo último acesso aconteceu entre agora e 3 dias atrás.' },
          { key: 'offline', label: 'Off-Line', total: statusCounts.offline, helper: 'Usuários que acessaram o sistema pela última vez há mais de 3 dias.' },
          { key: 'inactive', label: 'Inativo', total: statusCounts.inactive, helper: 'Usuários que nunca acessaram o sistema.' },
          { key: 'blocked', label: 'Desativado', total: statusCounts.blocked, helper: 'Contas bloqueadas manualmente, com histórico preservado.' },
        ].map((item) => {
          const percentage = usuarios.length ? (item.total / usuarios.length) * 100 : 0
          return (
            <article className={`user-status-summary-card is-${item.key}`} key={item.key}>
              <div className="user-status-summary-title">
                <span>{item.label}</span>
                <span className="user-status-helper" tabIndex={0} aria-label={`${item.label}: ${item.helper}`}>
                  ?<span role="tooltip">{item.helper}</span>
                </span>
              </div>
              <div className="user-status-summary-value">
                <strong>{item.total.toLocaleString('pt-BR')}</strong>
                <small>{percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</small>
              </div>
            </article>
          )
        })}
      </section>

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
          <div className="users-table unified-users-table" role="table" aria-label="Usuários">
            <div className="table-row table-head" role="row">
              <span role="columnheader">NOME</span>
              <span role="columnheader">PERFIL</span>
              <span role="columnheader">E-MAIL</span>
              <span role="columnheader">UF</span>
              <span role="columnheader">LOJAS</span>
              <span role="columnheader">STATUS</span>
              <span role="columnheader">ÚLTIMO ACESSO</span>
            </div>

            {pageUsers.map((usuario) => {
              const profileClass = getManagedRoleKey(usuario).toLowerCase()
              const activityStatus = getUserActivityStatus(usuario)
              const activityLabel = activityStatus === 'active'
                ? 'Ativo'
                : activityStatus === 'offline'
                  ? 'Off-Line'
                  : activityStatus === 'blocked' ? 'Desativado' : 'Inativo'

              return (
                <div
                  className="table-row user-registration-row"
                  role="row"
                  tabIndex={0}
                  key={usuario.id}
                  onClick={() => onOpenUsuario(usuario)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpenUsuario(usuario)
                    }
                  }}
                >
                  <div className="name-cell" role="cell">
                    <span className="avatar-mini">{getUserInitials(usuario.nome)}</span>
                    <strong>{usuario.nome}</strong>
                  </div>

                  <span role="cell" data-label="Perfil">
                    <span className={`profile-pill is-${profileClass}`}>{getManagedRoleLabel(usuario)}</span>
                  </span>

                  <div className="email-cell" role="cell" data-label="E-mail">
                    {usuario.email}
                  </div>

                  <span className="uf-cell" role="cell" data-label="UF">{getUserUfLabel(usuario)}</span>

                  <span className="stores-count-cell" role="cell" data-label="Lojas">
                    {usuario.perfil === 'Promotor' ? (storeCountByPromotor.get(usuario.id) ?? 0).toLocaleString('pt-BR') : '-'}
                  </span>

                  <span className="status-cell" role="cell" data-label="Status">
                    <span className={`status-pill is-${activityStatus}`}>
                      <span className="status-dot" aria-hidden="true" />
                      {activityLabel}
                    </span>
                  </span>

                  <span className="last-access-cell" role="cell" data-label="Último acesso">
                    {usuario.last_access_at
                      ? new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: 'America/Fortaleza',
                        }).format(new Date(usuario.last_access_at))
                      : 'Nunca'}
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

export function NotasScreen({ search, onSearch, lojas, usuarios = [], currentUser, restrictedUfs = [], canEditFinalized = false }) {
  const defaults = useMemo(() => getDefaultNoteDates(), [])
  const today = defaults.end
  const [startDate, setStartDate] = useState(defaults.start)
  const [endDate, setEndDate] = useState(defaults.end)
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedUf, setSelectedUf] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedResponsible, setSelectedResponsible] = useState('')
  const [selectedCreatedBy, setSelectedCreatedBy] = useState('')
  const [selectedUpdatedBy, setSelectedUpdatedBy] = useState('')
  const [selectedRoutePromoter, setSelectedRoutePromoter] = useState('')
  const [draftFilters, setDraftFilters] = useState(() => ({
    startDate: defaults.start, endDate: defaults.end, status: '', uf: [], city: [],
    responsibleId: '', createdById: '', updatedById: '', routePromoterId: '',
  }))
  const [selectedNote, setSelectedNote] = useState(null)
  const [selectedFstd, setSelectedFstd] = useState(null)
  const [selectedFinalized, setSelectedFinalized] = useState(null)
  const [completionMessage, setCompletionMessage] = useState('')
  const [sort, setSort] = useState({ key: 'data_emissao', direction: 'descending' })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const timer = window.setTimeout(() => { setCurrentPage(1); setDebouncedSearch(search) }, 300)
    return () => window.clearTimeout(timer)
  }, [search])
  const invoiceFilters = useMemo(() => {
    const normalizedSearch = debouncedSearch.trim()
    const isDefaultPeriod = startDate === defaults.start && endDate === defaults.end
    return {
      restrictedUfs,
      startDate: normalizedSearch && isDefaultPeriod ? '' : startDate,
      endDate: normalizedSearch && isDefaultPeriod ? '' : endDate,
      status: selectedStatus,
      uf: selectedUf,
      city: selectedCity,
      responsibleId: selectedResponsible,
      createdById: selectedCreatedBy,
      updatedById: selectedUpdatedBy,
      routePromoterId: selectedRoutePromoter,
      search: normalizedSearch,
      sortBy: sort.key,
      direction: sort.direction === 'ascending' ? 'asc' : 'desc',
      page: currentPage,
      pageSize,
    }
  }, [restrictedUfs, startDate, endDate, defaults, selectedStatus, selectedUf, selectedCity, selectedResponsible, selectedCreatedBy, selectedUpdatedBy, selectedRoutePromoter, debouncedSearch, sort, currentPage, pageSize])
  const invoicesQuery = useInvoices(invoiceFilters)
  const invoiceMutations = useInvoiceMutations()
  const result = invoicesQuery.data ?? { rows: [], total: 0, counts: {}, ufs: [], cities: [] }
  const notes = result.rows ?? []
  const loading = invoicesQuery.isFetching
  const error = invoicesQuery.error?.message ?? ''
  const totalPages = Math.max(1, Math.ceil(result.total / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const rangeStart = result.total === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(safeCurrentPage * pageSize, result.total)
  // The invoice overview may return no option metadata when there are no rows
  // (or while the RPC is unavailable). Stores are already loaded using the
  // user's UF scope, so use them as a safe source for the filter options too.
  const scopedStores = useMemo(() => {
    const allowed = new Set((restrictedUfs ?? []).map((uf) => String(uf).trim().toUpperCase()))
    return (lojas ?? []).filter((store) => {
      const uf = String(store.uf ?? '').trim().toUpperCase()
      return allowed.size === 0 || allowed.has(uf)
    })
  }, [lojas, restrictedUfs])
  const storeUfs = useMemo(() => (
    [...new Set(scopedStores
      .map((store) => String(store.uf ?? '').trim().toUpperCase())
      .filter(Boolean))].sort()
  ), [scopedStores])
  const ufs = useMemo(() => {
    const allowed = new Set((restrictedUfs ?? []).map((uf) => String(uf).trim().toUpperCase()))
    return [...new Set([...(result.ufs ?? []), ...storeUfs]
      .map((uf) => String(uf).trim().toUpperCase())
      .filter((uf) => uf && (allowed.size === 0 || allowed.has(uf))))].sort()
  }, [result.ufs, restrictedUfs, storeUfs])
  const cities = useMemo(() => {
    const selectedUfValues = (draftFilters.uf ?? []).map((uf) => String(uf).trim().toUpperCase())
    const storeCities = scopedStores
      .filter((store) => selectedUfValues.length === 0 || selectedUfValues.includes(String(store.uf ?? '').trim().toUpperCase()))
      .map((store) => String(store.cidade ?? '').trim())
      .filter(Boolean)
    const responseCities = (result.cities ?? []).map((city) => String(city).trim()).filter(Boolean)
    const candidates = selectedUfValues.length > 0 && storeCities.length > 0 ? storeCities : [...responseCities, ...storeCities]
    return [...new Set(candidates)].sort((left, right) => left.localeCompare(right, 'pt-BR'))
  }, [draftFilters.uf, result.cities, scopedStores])
  const responsibilityUsers = useMemo(() => (
    (usuarios ?? [])
      .filter((user) => user?.id && user?.nome && user?.ativo !== false && user?.acesso_habilitado !== false)
      .sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'))
  ), [usuarios])
  const routePromoters = useMemo(() => (
    responsibilityUsers.filter((user) => user.perfil === 'Promotor')
  ), [responsibilityUsers])
  // The product's default reporting period is the neutral state: only dates that
  // differ from getDefaultNoteDates contribute to the active-filter badge.
  const periodFilterCount = Number(draftFilters.startDate !== defaults.start) + Number(draftFilters.endDate !== defaults.end)
  const activeFilterCount = periodFilterCount + Number(Boolean(draftFilters.status))
    + draftFilters.uf.length + draftFilters.city.length
    + Number(Boolean(draftFilters.responsibleId)) + Number(Boolean(draftFilters.createdById))
    + Number(Boolean(draftFilters.updatedById)) + Number(Boolean(draftFilters.routePromoterId))
  const totals = { Geral: result.total, Finalizada: result.counts?.Finalizada ?? 0,
    Pendente: result.counts?.Pendente ?? 0, Desconhecida: result.counts?.Desconhecida ?? 0 }

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

    const startedProcess = await invoiceMutations.start.mutateAsync({ storeId: store.id, accessKey: String(note.chave_acesso) })
    const hydratedNote = startedProcess?.note ? { ...note, ...startedProcess.note } : note

    const selectedNfd = {
      ...hydratedNote,
      id: hydratedNote.chave_acesso,
      numero: String(hydratedNote.nota_fiscal),
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

  function handleFstdCompleted(result) {
    if (!selectedFstd?.note || !selectedFstd?.store) return

    const finalizedNote = {
      ...selectedFstd.note,
      status: 'Finalizada',
      status_nfd: 'finalizada',
    }

    void invoicesQuery.refetch()
    const message = result?.kind === 'legacy-totals-saved'
      ? `NFD ${finalizedNote.nota_fiscal ?? finalizedNote.numero} atualizada com sucesso.`
      : `NFD ${finalizedNote.nota_fiscal ?? finalizedNote.numero} finalizada com sucesso.`
    setCompletionMessage(message)
    setSelectedFstd(null)
    setSelectedFinalized({ note: finalizedNote, store: selectedFstd.store })
  }

  function handleStartDateChange(value) {
    const latestStartDate = draftFilters.endDate && draftFilters.endDate < today ? draftFilters.endDate : today
    setDraftFilters((current) => ({ ...current, startDate: value > latestStartDate ? latestStartDate : value }))
  }

  function handleEndDateChange(value) {
    const nextEndDate = value > today ? today : value
    setDraftFilters((current) => ({ ...current, endDate: nextEndDate, startDate: nextEndDate && current.startDate > nextEndDate ? nextEndDate : current.startDate }))
  }

  function handleApplyFilters() {
    setCurrentPage(1)
    setStartDate(draftFilters.startDate)
    setEndDate(draftFilters.endDate)
    setSelectedStatus(draftFilters.status)
    setSelectedUf(draftFilters.uf.join(','))
    setSelectedCity(draftFilters.city.join(','))
    setSelectedResponsible(draftFilters.responsibleId)
    setSelectedCreatedBy(draftFilters.createdById)
    setSelectedUpdatedBy(draftFilters.updatedById)
    setSelectedRoutePromoter(draftFilters.routePromoterId)
    setIsFilterOpen(false)
  }

  function handleClearFilters() {
    setCurrentPage(1)
    setStartDate(defaults.start)
    setEndDate(defaults.end)
    setSelectedStatus('')
    setSelectedUf('')
    setSelectedCity('')
    setSelectedResponsible('')
    setSelectedCreatedBy('')
    setSelectedUpdatedBy('')
    setSelectedRoutePromoter('')
    setDraftFilters({
      startDate: defaults.start, endDate: defaults.end, status: '', uf: [], city: [],
      responsibleId: '', createdById: '', updatedById: '', routePromoterId: '',
    })
  }

  function toggleDraftUf(uf) {
    setDraftFilters((current) => ({
      ...current,
      uf: current.uf.includes(uf) ? current.uf.filter((item) => item !== uf) : [...current.uf, uf],
      city: [],
    }))
  }

  function toggleDraftCity(city) {
    setDraftFilters((current) => ({
      ...current,
      city: current.city.includes(city) ? current.city.filter((item) => item !== city) : [...current.city, city],
    }))
  }

  function toggleDraftStatus(status) {
    setDraftFilters((current) => ({ ...current, status: current.status === status ? '' : status }))
  }

  function toggleDraftUser(field, userId) {
    setDraftFilters((current) => ({ ...current, [field]: current[field] === userId ? '' : userId }))
  }

  function handleSort(key) {
    setCurrentPage(1)
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'ascending' ? 'descending' : 'ascending',
    }))
  }

  return (
    <section className="notes-page">
      <div className="notes-card">
        <PageToolbar
          className="notes-page-toolbar"
          title="Notas Fiscais de Devolução"
          search={{ value: search, onChange: (value) => { setCurrentPage(1); onSearch(value) }, placeholder: 'Procurar por NFD ou nome', label: 'Procurar notas por NFD ou nome' }}
        >
          <FilterPopover
            activeFilterCount={activeFilterCount}
            isOpen={isFilterOpen}
            onToggle={setIsFilterOpen}
            onApply={handleApplyFilters}
            onClear={handleClearFilters}
          >
            <FilterSection title="Período" count={periodFilterCount} id="note-filter-period">
              <div className="notes-filter-fields">
                <label>Data inicial<input aria-label="Data inicial" type="date" value={draftFilters.startDate} max={draftFilters.endDate && draftFilters.endDate < today ? draftFilters.endDate : today} onChange={(event) => handleStartDateChange(event.target.value)} /></label>
                <label>Data final<input aria-label="Data final" type="date" value={draftFilters.endDate} min={draftFilters.startDate} max={today} onChange={(event) => handleEndDateChange(event.target.value)} /></label>
              </div>
            </FilterSection>
            <FilterSection title="Status" count={Number(Boolean(draftFilters.status))} id="note-filter-status">
              <div className="filter-options">
                {NOTE_STATUS_OPTIONS.map((item) => (
                  <label key={item} className="filter-option">
                    <span>{item}</span>
                    <input aria-label={item} checked={draftFilters.status === item} onChange={() => toggleDraftStatus(item)} type="checkbox" />
                  </label>
                ))}
              </div>
            </FilterSection>
            <FilterSection title="UF" count={draftFilters.uf.length} id="note-filter-uf">
              <div className="filter-options">
                {ufs.map((item) => (
                  <label key={item} className="filter-option">
                    <span>{item}</span>
                    <input aria-label={item} checked={draftFilters.uf.includes(item)} onChange={() => toggleDraftUf(item)} type="checkbox" />
                  </label>
                ))}
                {ufs.length === 0 && <p className="filter-empty">Nenhuma UF disponível.</p>}
              </div>
            </FilterSection>
            <FilterSection title="Cidade" count={draftFilters.city.length} id="note-filter-city">
              <div className="filter-options">
                {cities.map((item) => (
                  <label key={item} className="filter-option">
                    <span>{item}</span>
                    <input aria-label={item} checked={draftFilters.city.includes(item)} onChange={() => toggleDraftCity(item)} type="checkbox" />
                  </label>
                ))}
                {cities.length === 0 && <p className="filter-empty">Nenhuma cidade disponível.</p>}
              </div>
            </FilterSection>
            <FilterSection title="Responsável" count={Number(Boolean(draftFilters.responsibleId))} id="note-filter-responsible">
              <p className="filter-hint">Usa a rota enquanto pendente e o autor depois da finalização.</p>
              <div className="filter-options">
                {responsibilityUsers.map((user) => (
                  <label key={user.id} className="filter-option">
                    <span>{user.nome}</span>
                    <input aria-label={`Responsável: ${user.nome}`} checked={draftFilters.responsibleId === user.id} onChange={() => toggleDraftUser('responsibleId', user.id)} type="checkbox" />
                  </label>
                ))}
                {responsibilityUsers.length === 0 && <p className="filter-empty">Nenhum usuário disponível.</p>}
              </div>
            </FilterSection>
            <FilterSection title="Criado por" count={Number(Boolean(draftFilters.createdById))} id="note-filter-created-by">
              <div className="filter-options">
                {responsibilityUsers.map((user) => (
                  <label key={user.id} className="filter-option">
                    <span>{user.nome}</span>
                    <input aria-label={`Criado por: ${user.nome}`} checked={draftFilters.createdById === user.id} onChange={() => toggleDraftUser('createdById', user.id)} type="checkbox" />
                  </label>
                ))}
              </div>
            </FilterSection>
            <FilterSection title="Atualizado por" count={Number(Boolean(draftFilters.updatedById))} id="note-filter-updated-by">
              <div className="filter-options">
                {responsibilityUsers.map((user) => (
                  <label key={user.id} className="filter-option">
                    <span>{user.nome}</span>
                    <input aria-label={`Atualizado por: ${user.nome}`} checked={draftFilters.updatedById === user.id} onChange={() => toggleDraftUser('updatedById', user.id)} type="checkbox" />
                  </label>
                ))}
              </div>
            </FilterSection>
            <FilterSection title="Promotor da rota" count={Number(Boolean(draftFilters.routePromoterId))} id="note-filter-route-promoter">
              <div className="filter-options">
                {routePromoters.map((user) => (
                  <label key={user.id} className="filter-option">
                    <span>{user.nome}</span>
                    <input aria-label={`Promotor da rota: ${user.nome}`} checked={draftFilters.routePromoterId === user.id} onChange={() => toggleDraftUser('routePromoterId', user.id)} type="checkbox" />
                  </label>
                ))}
              </div>
            </FilterSection>
          </FilterPopover>
        </PageToolbar>

        {!loading && <div className="notes-summary" aria-label="Totais das notas">
          {Object.entries(totals).map(([label, total]) => (
            <article className={`notes-summary-card is-${label.toLowerCase()}`} key={label}>
              <span>{label}</span>
              <div className="notes-summary-value">
                <strong>{formatNoteQuantity(total)}</strong>
                {label !== 'Geral' && <small>{formatNotePercentage(total, totals.Geral)}</small>}
              </div>
            </article>
          ))}
        </div>}

        {completionMessage && (
          <p className="notes-completion-message" role="status">
            {completionMessage}
          </p>
        )}

        {loading && <LoadingState className="notes-loading">Carregando notas fiscais...</LoadingState>}

        {!loading && error && <p className="table-message">{error}</p>}

        {!loading && !error && notes.length > 0 && (
            <div className="notes-table" role="table" aria-label="Notas fiscais">
              <div className="notes-row notes-head" role="row">
                {NOTE_SORT_COLUMNS.map((column) => {
                  const isActive = sort.key === column.key
                  const indicator = sort.direction === 'ascending' ? '↑' : '↓'
                  return (
                    <span key={column.key} role="columnheader" aria-sort={isActive ? sort.direction : undefined}>
                      <button type="button" onClick={() => handleSort(column.key)}>
                        {column.label}
                        {isActive && <span className="notes-sort-indicator" aria-hidden="true">{indicator}</span>}
                      </button>
                    </span>
                  )
                })}
              </div>

              {notes.map((note) => {
                const storeName = note.nome_abreviado?.trim() || note.estabelecimento?.trim() || String(note.codigo_cliente ?? '-')
                return (
                <div
                  className="notes-row notes-row-interactive"
                  role="row"
                  key={note.chave_acesso || `${getNoteDateKey(note)}-${note.nota_fiscal}-${storeName}`}
                  tabIndex="0"
                  onClick={() => handleSelectNote(note)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleSelectNote(note)
                    }
                  }}
                >
                  <span className="notes-store-cell" role="cell">
                    <NotaStatusIcon status={note.status} />
                    <strong>{storeName}</strong>
                  </span>
                  <span role="cell">{String(note.nota_fiscal ?? '-')}</span>
                  <span role="cell">{formatNoteDate(note.data_emissao ?? note.data_referencia)}</span>
                  <span role="cell">{note.uf || '-'}</span>
                  <span role="cell">{note.status}</span>
                </div>
              )})}
            </div>
        )}

        {!loading && !error && notes.length > 0 && (
          <footer className="notes-table-footer">
            <p aria-live="polite">{rangeStart}–{rangeEnd} de {result.total}</p>
            <label className="notes-page-size">
              <span>Linhas por página</span>
              <AppSelect
                aria-label="Linhas por página"
                value={String(pageSize)}
                onChange={(event) => {
                  setCurrentPage(1)
                  setPageSize(Number(event.target.value))
                }}
              >
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
              </AppSelect>
            </label>
            <Pagination
              className="notes-pagination"
              currentPage={safeCurrentPage}
              label="Paginação das notas fiscais"
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </footer>
        )}

        {!loading && !error && notes.length === 0 && (
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
  const location = useLocation()
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
    allowedUfs: isScopedGerencial(currentUser)
      ? [...new Set((currentUser.ufs ?? []).map((uf) => String(uf).trim().toUpperCase()).filter(Boolean))]
      : [],
    canManageAllUsers: !isScopedGerencial(currentUser),
    canManageStores: currentUser?.perfil === 'Admin' && currentUser?.auth_role === 'admin',
  }
  const [isDesktop, setIsDesktop] = useState(() => typeof window === 'undefined' || window.innerWidth > 980)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 760)
  const [sidebarExpanded, setSidebarExpanded] = useState(() => typeof window === 'undefined' || window.innerWidth > 980)
  const mobileMenuTriggerRef = useRef(null)
  const selectedItem = getGerencialScreenFromPath(location.pathname) ?? 'dashboard'
  const search = getGerencialSearch(location.search)
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [isCadastroOpen, setCadastroOpen] = useState(false)
  const [isFilterOpen, setFilterOpen] = useState(false)
  const [form, setForm] = useState(initialUserForm)
  const [selectedUsuario, setSelectedUsuario] = useState(null)
  const [editForm, setEditForm] = useState(initialUserForm)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingUser, setDeletingUser] = useState(false)
  const [accessBusy, setAccessBusy] = useState(false)
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)
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
  })
  const [gerencialBusy, setGerencialBusy] = useState(false)
  const [gerencialError, setGerencialError] = useState('')
  const [profilePhoto, setProfilePhoto] = useState('')

  useEffect(() => {
    function handleViewportChange() {
      const desktop = window.innerWidth > 980
      const mobile = window.innerWidth <= 760
      setIsDesktop(desktop)
      setIsMobile(mobile)
      if (desktop) setSidebarExpanded(true)
      if (mobile) setSidebarExpanded(false)
    }

    window.addEventListener('resize', handleViewportChange)
    return () => window.removeEventListener('resize', handleViewportChange)
  }, [])

  useEffect(() => {
    if (!isAdministrativeProfile(currentUser)) return

    const routeScreen = getGerencialScreenFromPath(location.pathname)
    const nextScreen = routeScreen ?? 'dashboard'

    if (routeScreen === null || !isCanonicalGerencialPath(location.pathname, nextScreen)) {
      navigate(
        getGerencialScreenPath(location.pathname, currentUser.perfil, nextScreen),
        { replace: true },
      )
    }
  }, [currentUser, location.pathname, navigate])

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
          (usuario) => usuario.perfil === 'Promotor',
        ),
      )
      const visibleStoreIds = new Set((lojasResult.data ?? []).map((loja) => loja.id))
      setLojaPromotores(
        (vinculosResult.data ?? []).filter((vinculo) => visibleStoreIds.has(vinculo.loja_id)),
      )
    }

    setLojasLoading(false)
  }

  async function loadNotasStores() {
    setLojasLoading(true)
    setLojasError('')
    try {
      setLojas(sortStoresByCode(await listStores({ ufs: gerencialCapabilities.allowedUfs })))
    } catch (requestError) {
      setLojasError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar as lojas.')
      setLojas([])
    } finally {
      setLojasLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    async function bootstrapGerencial() {
      if (
        authLoading ||
        !session ||
        !isAdministrativeProfile(currentUser)
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

      if (!isMounted) return
      if (selectedItem === 'usuarios') await loadUsuarios()
      if (selectedItem === 'lojas') await loadLojas()
      if (selectedItem === 'notas') await loadNotasStores()
    }

    void bootstrapGerencial()

    return () => {
      isMounted = false
    }
    // Operational data reloads when the centralized authenticated profile changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authLoading,
    currentUser?.auth_user_id,
    currentUser?.auth_role,
    currentUser?.foto_url,
    currentUser?.perfil,
    session?.user?.id,
    selectedItem,
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
  const isAttachedPhotos = selectedItem === 'fotos-anexadas'
  const isRelatorios = selectedItem === 'relatorios'
  const {
    title: pageTitle,
    subtitle: pageSubtitle,
    icon: heroIcon,
  } = getGerencialScreenMetadata(selectedItem, getManagedRoleLabel(currentUser))

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
      password: form.perfil === 'Promotor' ? DEFAULT_PROMOTER_PASSWORD : form.senha,
      perfil: form.perfil,
      estado: form.ufs?.[0] ?? form.estado,
      ufs: form.perfil === 'Admin' ? [] : form.ufs,
    }

    if (
      !emailPattern.test(payload.email) ||
      payload.nome.length < 4 ||
      (payload.perfil !== 'Promotor' && getPasswordValidationMessage(payload.password)) ||
      isNomeDuplicado(payload.nome, usuarios) ||
      isEmailDuplicado(payload.email, usuarios) ||
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
    })
    setEditError('')
    setEditOpen(true)
  }

  function closeUserModals() {
    setSelectedUsuario(null)
    setEditForm(initialUserForm)
    setEditError('')
    setAccessBusy(false)
    setEditOpen(false)
    setDeleteConfirmationOpen(false)
  }

  async function handleEditUsuario(event) {
    event.preventDefault()

    if (!selectedUsuario) return

    const payload = {
      email: editForm.email.trim().toLowerCase(),
      nome: normalizaNome(editForm.nome),
      perfil: editForm.perfil,
      estado: editForm.estado,
      ufs: editForm.perfil === 'Admin' ? [] : (editForm.ufs ?? [editForm.estado]),
      auth_role: editForm.perfil === 'Admin' ? 'admin' : editForm.perfil.toLowerCase(),
      ...(editForm.senha ? { password: editForm.senha } : {}),
    }

    if (
      !emailPattern.test(payload.email) ||
      payload.nome.length < 4 ||
      isNomeDuplicado(payload.nome, usuarios, selectedUsuario.id) ||
      getPasswordValidationMessage(editForm.senha, { optional: true }) ||
      !(gerencialCapabilities.isAdmin ? perfisEditaveis : ['Promotor']).includes(payload.perfil) ||
      (payload.perfil !== 'Admin' && (payload.ufs.length === 0 || payload.ufs.some((uf) => isScopedGerencial(currentUser)
        ? !currentUser.ufs.includes(uf)
        : !estados.includes(uf)))) ||
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

    if (!deleteConfirmationOpen) {
      setDeleteConfirmationOpen(true)
      return
    }

    setDeletingUser(true)
    setEditError('')

    try {
      await deleteManagedUser(selectedUsuario.id)
    } catch (deleteError) {
      setEditError(deleteError instanceof Error ? deleteError.message : 'Não foi possível excluir o acesso do usuário.')
      setDeletingUser(false)
      return
    }

    setDeletingUser(false)
    closeUserModals()
    await loadUsuarios()
    await loadLojas()
  }

  async function handleToggleUsuarioAccess() {
    if (!selectedUsuario) return

    const accessEnabled = selectedUsuario.ativo && selectedUsuario.acesso_habilitado
    if (accessEnabled) {
      const shouldDisable = window.confirm(
        `Desativar o acesso de ${selectedUsuario.nome}? O histórico e as rotas serão preservados.`,
      )
      if (!shouldDisable) return
    }

    setAccessBusy(true)
    setEditError('')

    try {
      await setManagedUserAccess(selectedUsuario.id, !accessEnabled)
    } catch (accessError) {
      setEditError(accessError instanceof Error ? accessError.message : 'Não foi possível alterar o acesso do usuário.')
      setAccessBusy(false)
      return
    }

    setAccessBusy(false)
    closeUserModals()
    await loadUsuarios()
    await loadLojas()
  }

  async function handleLogout() {
    await signOut()
    setProfilePhoto('')
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
    })
    setGerencialError('')
  }

  function cancelEditGerencial() {
    setGerencialEditId('')
    setGerencialEditForm({ nome: '', email: '', senha: '' })
    setGerencialError('')
  }

  async function handleSaveGerencial() {
    const payload = {
      usuario_id: gerencialEditId,
      nome: normalizaTexto(gerencialEditForm.nome),
      email: gerencialEditForm.email.trim().toLowerCase(),
      senha: gerencialEditForm.senha,
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

  function closeMobileSidebar() {
    if (isMobile) mobileMenuTriggerRef.current?.focus()
    setSidebarExpanded(false)
  }

  function handleSelectItem(item) {
    navigate(getGerencialScreenPath(location.pathname, currentUser?.perfil, item))
    setFilterOpen(false)
    setCadastroOpen(false)
    setGerencialError('')
    setGerencialEditId('')
    if (isMobile) closeMobileSidebar()
  }

  function handleSearchChange(value) {
    navigate(setGerencialSearch(location.pathname, location.search, value), { replace: true })
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
        isMobile={isMobile}
        expanded={sidebarExpanded}
        canCollapse={!isDesktop && !isMobile}
        selectedItem={selectedItem}
        currentUser={currentUser}
        profilePhoto={profilePhoto}
        onLogout={handleLogout}
        onSelect={handleSelectItem}
        onClose={closeMobileSidebar}
        onToggle={() => setSidebarExpanded((open) => !open)}
      />}
    >

      <main className={`workspace ${sidebarExpanded ? 'sidebar-open' : ''} ${isUsuarios ? 'registration-workspace' : ''}`}>
        <header className="page-hero">
          <div className="page-hero-inner">
            {isMobile && (
              <button
                className="mobile-menu-trigger"
                ref={mobileMenuTriggerRef}
                type="button"
                aria-controls="gerencial-main-navigation"
                aria-expanded={sidebarExpanded}
                aria-label={sidebarExpanded ? 'Fechar menu principal' : 'Abrir menu principal'}
                onClick={() => setSidebarExpanded((open) => !open)}
              >
                <span aria-hidden="true" />
              </button>
            )}
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
            lojaPromotores={lojaPromotores}
            loading={loading}
            error={error || gerencialError}
            busy={gerencialBusy}
            editId={gerencialEditId}
            editForm={gerencialEditForm}
            search={search}
            onSearch={handleSearchChange}
            onOpenCadastro={() => setCadastroOpen(true)}
            onOpenUsuario={openInfoModal}
            onEditChange={(patch) => setGerencialEditForm((current) => ({ ...current, ...patch }))}
            onStartEdit={startEditGerencial}
            onCancelEdit={cancelEditGerencial}
            onSaveEdit={handleSaveGerencial}
            onDelete={handleDeleteGerencial}
            restrictedUfs={gerencialCapabilities.allowedUfs}
          />
        ) : isDashboard ? (
          <ManagementDashboard restrictedUfs={gerencialCapabilities.allowedUfs} />
        ) : isAttachedPhotos ? (
          <AttachedPhotosScreen canEditFinalized={can(currentUser, 'fstd.editFinalized')} />
        ) : isRelatorios ? (
          <ReportScreen />
        ) : isNotas ? (
          <NotasScreen
            search={search}
            onSearch={handleSearchChange}
            lojas={lojas}
            usuarios={usuarios}
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
            onSearch={handleSearchChange}
            onToggleFilter={(open) => setFilterOpen(open)}
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
          lojas={lojaPromotores
            .filter((vinculo) => vinculo.promotor_id === selectedUsuario.id)
            .sort((a, b) => a.posicao - b.posicao)
            .map((vinculo) => lojas.find((loja) => loja.id === vinculo.loja_id))
            .filter(Boolean)}
          onClose={closeUserModals}
          onEdit={openEditModal}
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
          accessBusy={accessBusy}
          accessEnabled={selectedUsuario.ativo && selectedUsuario.acesso_habilitado}
          canToggleAccess={selectedUsuario.id !== currentUser?.id}
          error={editError}
          onChange={(patch) => setEditForm((current) => ({ ...current, ...patch }))}
          onBack={() => {
            setEditOpen(false)
            setEditError('')
          }}
          onClose={closeUserModals}
          onSubmit={handleEditUsuario}
          onDelete={handleDeleteUsuario}
          onToggleAccess={handleToggleUsuarioAccess}
          deleteConfirmationOpen={deleteConfirmationOpen}
          onCancelDelete={() => setDeleteConfirmationOpen(false)}
          allowedProfiles={gerencialCapabilities.isAdmin ? perfisEditaveis : ['Promotor']}
        />
      )}

    </GerencialApplicationShell>
  )
}

export default GerencialApp
