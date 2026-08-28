import { getFstdTargetProducts, getNfdKey, getNfdProducts, getNfdReturnRates, getNfdTabStatus, getNfdVisualStatus, getProductGroupKey, mergeNfdProducts, normalizeProductCode } from '../../invoices'
import { buildSaveFstdProductCommand } from '../model/commands'
import { keepNumericNfdCode } from '../model/validation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../shared/lib/supabaseClient'
import { usePromotorWorkspace } from '../../promotor/hooks/usePromotorWorkspace'
import { FSTD_PDF_TEMPLATE_VERSION, generateFstdPdf } from '../../../shared/lib/fstdPdf'
import { createLegacyFstdDocument, legacyFstdLookupParams } from '../services/fstdLegadoPdf'
import { getProfilePhotoSignedUrl, uploadProfilePhoto } from '../../../shared/lib/profilePhoto'
import { getProfileLabel } from '../../../shared/lib/profileLabels.js'
import LogoutConfirmDialog from '../../../shared/components/LogoutConfirmDialog.jsx'
import { AppSelect, EmptyState, SearchField } from '../../../shared/ui'
import avineLogo from '../../../shared/assets/foto_logoavine.png'
import profileUserIcon from '../../../shared/assets/ui-icons/do-utilizador.png'
import cameraIcon from '../../../shared/assets/fstd-icons/camera.png'
import './PromotorWorkspace.css'

const statusTabs = [
  { id: 'atrasada', label: 'Atrasadas' },
  { id: 'finalizada', label: 'Finalizadas' },
  { id: 'avulsa', label: 'Avulsas' },
  { id: 'outros', label: 'Desconhecido' },
]

const initialFstdForm = {
  motivoId: '',
  gal: '',
  cod: '',
  notaVenda: '',
  lotes: '',
  fotos: [],
}

const FSTD_ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const FSTD_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const supportWhatsappMessage = 'Olá! Preciso de suporte na plataforma Avine.'
const supportWhatsappUrl = `https://wa.me/5585986532599?text=${encodeURIComponent(supportWhatsappMessage)}`

function validateFstdPhoto(file) {
  if (!FSTD_ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Envie fotos nos formatos JPG, PNG ou WebP.')
  }

  if (file.size > FSTD_MAX_FILE_SIZE_BYTES) {
    throw new Error('Cada foto pode ter no máximo 10 MB.')
  }
}

function normalizeQuantity(value) {
  const quantity = Number.parseInt(value, 10)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0
}

function normalizeNonNegativeQuantity(value) {
  const quantity = Number.parseInt(value, 10)
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : 0
}

function formatDate(date) {
  if (!date) return '-'

  const value = String(date)
  const parsedDate = value.length === 10
    ? new Date(`${value}T00:00:00`)
    : new Date(value)

  if (Number.isNaN(parsedDate.getTime())) return '-'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsedDate)
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    currency: 'BRL',
    style: 'currency',
  }).format(value ?? 0)
}

function getFirstName(name) {
  return name?.split(/\s+/).filter(Boolean)[0] ?? 'Promotor'
}

function getStoreTitle(store) {
  return store?.nome ?? 'Loja'
}

function getStoreCode(store, nfd) {
  return store?.codigo ?? nfd?.loja_codigo ?? '-'
}

function getNfdNumber(nfd) {
  return nfd?.nota_fiscal ?? nfd?.numero ?? '-'
}

function getBilledGal(nfd) {
  return Number(nfd?.quantidade_galinha ?? 0)
}

function getBilledCod(nfd) {
  return Number(nfd?.quantidade_codorna ?? 0)
}

function formatReturnPercentage(value) {
  return String(Math.round(Number(value) || 0))
}

function getCatalogProductKey(product) {
  return getProductGroupKey(product)
}

function groupCatalogProducts(products) {
  const productsByKey = new Map()

  for (const product of products ?? []) {
    const code = normalizeProductCode(product.codigo_produto)
    const key = getCatalogProductKey({ ...product, codigo_produto: code })
    if (!key || !code) continue

    const current = productsByKey.get(key)
    if (current) {
      if (!current.codigos_produto.includes(code)) current.codigos_produto.push(code)
      current.codigos_busca = current.codigos_produto.join(' ')
      continue
    }

    productsByKey.set(key, {
      ...product,
      produto_id: product.produto_id ?? null,
      codigo_produto: code,
      codigos_produto: [code],
      codigos_busca: code,
    })
  }

  return [...productsByKey.values()]
}

function getProductImageCandidates(value) {
  const url = String(value ?? '').trim()
  if (!url) return []

  const rawId = url.match(/[?&]id=([^&#]+)/i)?.[1]
    || url.match(/(?:drive|docs)\.google\.com\/(?:file|document)\/d\/([^/?#=]+)/i)?.[1]
    || url.match(/googleusercontent\.com\/d\/([^/?#=]+)/i)?.[1]
  const id = rawId ? decodeURIComponent(rawId) : ''

  if (!id) return [url]

  const driveCandidates = [
    `https://lh3.googleusercontent.com/d/${id}=w1000`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
    `https://drive.usercontent.google.com/download?id=${id}&export=view`,
    `https://drive.google.com/uc?export=view&id=${id}`,
  ]

  return [...new Set([...driveCandidates, url])]
}

function getManualNfdKey(storeId, nfdNumber) {
  const normalizedNumber = String(nfdNumber ?? '').trim().replace(/^0+/, '') || '0'
  return `manual:${storeId ?? ''}:${normalizedNumber}`
}

function getLocalIsoDate() {
  const today = new Date()
  const offset = today.getTimezoneOffset() * 60000
  return new Date(today.getTime() - offset).toISOString().slice(0, 10)
}

function getProductBilledQuantity(product, kind) {
  const persistedValue = Number(product?.persisted?.[`quantidade_faturada_${kind}`] ?? 0)
  const sourceValue = Number(product?.[`quantidade_faturada_${kind}`] ?? 0)

  return persistedValue > 0 || sourceValue <= 0 ? persistedValue : sourceValue
}

const PROMOTOR_UNKNOWN_NFD_KEY = 'fstd-promotor-unknown-nfds'

function getUnknownNfdStorageKey(profileId) {
  return `${PROMOTOR_UNKNOWN_NFD_KEY}:${profileId}`
}

function readUnknownNfdComments(profileId) {
  try {
    const value = window.localStorage.getItem(getUnknownNfdStorageKey(profileId))
    return value ? JSON.parse(value) : {}
  } catch {
    return {}
  }
}

function saveUnknownNfdComments(profileId, comments) {
  try {
    window.localStorage.setItem(getUnknownNfdStorageKey(profileId), JSON.stringify(comments))
  } catch {
    // O status visual continua nesta sessão mesmo sem persistência local.
  }
}

async function copyToClipboard(value) {
  if (!value) return false

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return true
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    return document.execCommand('copy')
  } finally {
    textarea.remove()
  }
}

function filterBySearch(items, search, fields) {
  const query = search.trim().toLowerCase()
  if (!query) return items

  return items.filter((item) =>
    fields.some((field) => String(item[field] ?? '').toLowerCase().includes(query)),
  )
}

function MobileProfileMenu({ profile, profilePhoto, onLogout, onUploadPhoto, photoBusy }) {
  const [photoError, setPhotoError] = useState('')

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onUploadPhoto) return

    setPhotoError('')

    try {
      await onUploadPhoto(file)
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Não foi possível atualizar a foto.')
    }
  }

  return (
    <div className="mobile-profile-menu" role="menu" aria-label="Informações do perfil">
      <div className="mobile-profile-menu-info">
        <label className={`mobile-profile-photo-picker${photoBusy ? ' is-uploading' : ''}`} title="Adicionar foto de perfil">
          <input
            accept="image/jpeg,image/png,image/webp"
            disabled={photoBusy}
            onChange={handlePhotoChange}
            type="file"
          />
          <span className="mobile-profile-avatar">
            {profilePhoto ? <img src={profilePhoto} alt="Foto do perfil" /> : <img className="profile-placeholder-icon" src={profileUserIcon} alt="" />}
          </span>
          <span className="mobile-profile-photo-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5A1.5 1.5 0 0 1 5.5 6h2l1-1.5h7L16.5 6h2A1.5 1.5 0 0 1 20 7.5v10A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-10Z" />
              <circle cx="12" cy="12.5" r="3.2" />
            </svg>
          </span>
        </label>
        <div className="mobile-profile-menu-copy">
          <strong>{profile?.nome ?? 'Usuário'}</strong>
          <span>{profile?.email ?? 'E-mail não informado'}</span>
        </div>
      </div>
      {photoError && <span className="mobile-profile-photo-error">{photoError}</span>}

      <dl className="mobile-profile-menu-details">
        <div>
          <dt>Função</dt>
          <dd>{getProfileLabel(profile?.perfil ?? 'Promotor')}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{profile?.estado || 'Não informado'}</dd>
        </div>
      </dl>

      <div className="mobile-profile-menu-divider" />
      <button className="mobile-profile-logout" type="button" role="menuitem" onClick={onLogout}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 8l4 4-4 4M17 12H9" />
        </svg>
        <span>Sair</span>
      </button>
    </div>
  )
}

function SupportIcon() {
  return (
    <svg className="mobile-support-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 13a8 8 0 0 1 16 0" />
      <path d="M4 13v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2Z" />
      <path d="M20 13v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2Z" />
      <path d="M17 18a5 5 0 0 1-5 3h-1" />
    </svg>
  )
}

function AppHeader({
  title,
  onBack,
  onLogout,
  onMenu,
  onUploadPhoto,
  photoBusy,
  profile,
  profilePhoto,
  profileMenuOpen,
  onCloseProfileMenu,
  showSupport = false,
}) {
  const profileControlRef = useRef(null)
  const [isLogoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [isLoggingOut, setLoggingOut] = useState(false)

  function requestLogout() {
    if (!onLogout) return
    onCloseProfileMenu?.()
    setLogoutConfirmOpen(true)
  }

  async function confirmLogout() {
    setLoggingOut(true)
    try {
      await onLogout?.()
    } finally {
      setLoggingOut(false)
    }
  }

  useEffect(() => {
    if (!profileMenuOpen || !onCloseProfileMenu) return undefined

    function handlePointerDown(event) {
      if (!profileControlRef.current?.contains(event.target)) onCloseProfileMenu()
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') onCloseProfileMenu()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onCloseProfileMenu, profileMenuOpen])

  return (
    <header className="mobile-header">
      <div className={`mobile-titlebar ${onBack ? 'has-back' : 'no-back'}${showSupport ? ' has-support' : ''}`}>
        {onBack ? (
          <button className="mobile-icon-button" type="button" onClick={onBack} aria-label="Voltar">
            ‹
          </button>
        ) : (
          <span className="mobile-spacer" />
        )}
        <strong>{title}</strong>
        {showSupport && (
          <a
            className="mobile-support-link"
            href={supportWhatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir suporte pelo WhatsApp"
            title="Suporte"
          >
            <SupportIcon />
            <span>Suporte</span>
          </a>
        )}
        {onMenu ? (
          <div className="mobile-profile-control" ref={profileControlRef}>
            <button
              className={`mobile-profile-trigger ${profileMenuOpen ? 'is-open' : ''}`}
              type="button"
              onClick={onMenu}
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
              aria-label="Abrir perfil e opções"
              title="Perfil e opções"
            >
              <span className="mobile-profile-avatar">
                {profilePhoto ? <img src={profilePhoto} alt="" /> : <img className="profile-placeholder-icon" src={profileUserIcon} alt="" />}
              </span>
              <span className="mobile-profile-trigger-copy">
                <strong>{profile?.nome ?? 'Usuário'}</strong>
                <small>{getProfileLabel(profile?.perfil ?? 'Promotor')}</small>
              </span>
              <span className="mobile-profile-chevron" aria-hidden="true" />
            </button>

            {profileMenuOpen && (
              <MobileProfileMenu
                onLogout={requestLogout}
                onUploadPhoto={onUploadPhoto}
                photoBusy={photoBusy}
                profile={profile}
                profilePhoto={profilePhoto}
              />
            )}
          </div>
        ) : onLogout ? (
          <button className="mobile-icon-button mobile-logout-button" type="button" onClick={requestLogout} aria-label="Sair" title="Sair">
            <svg
              className="mobile-logout-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M7.5 3.75A1.5 1.5 0 0 0 6 5.25v13.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5V15a.75.75 0 0 1 1.5 0v3.75a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3V5.25a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3V9A.75.75 0 0 1 15 9V5.25a1.5 1.5 0 0 0-1.5-1.5h-6Zm10.72 4.72a.75.75 0 0 1 1.06 0l3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 1 1-1.06-1.06l1.72-1.72H9a.75.75 0 0 1 0-1.5h10.94l-1.72-1.72a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : (
          <span className="mobile-spacer" />
        )}
      </div>
      <LogoutConfirmDialog
        isLoading={isLoggingOut}
        isOpen={isLogoutConfirmOpen}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={confirmLogout}
      />
    </header>
  )
}

function EmptyNotice({ children }) {
  return <EmptyState className="empty-notice">{children}</EmptyState>
}

function StoreIcon({ status }) {
  return (
    <svg
      className={`store-glyph is-${status}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d="M5.223 2.25c-.497 0-.974.198-1.325.55l-1.3 1.298A3.75 3.75 0 0 0 7.5 9.75c.627.47 1.406.75 2.25.75.844 0 1.624-.28 2.25-.75.626.47 1.406.75 2.25.75.844 0 1.623-.28 2.25-.75a3.75 3.75 0 0 0 4.902-5.652l-1.3-1.299a1.875 1.875 0 0 0-1.325-.549H5.223Z"
      />
      <path
        fillRule="evenodd"
        d="M3 20.25v-8.755c1.42.674 3.08.673 4.5 0A5.234 5.234 0 0 0 9.75 12c.804 0 1.568-.182 2.25-.506a5.234 5.234 0 0 0 2.25.506c.804 0 1.567-.182 2.25-.506 1.42.674 3.08.675 4.5.001v8.755h.75a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1 0-1.5H3Zm3-6a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-3Zm8.25-.75a.75.75 0 0 0-.75.75v5.25c0 .414.336.75.75.75h3a.75.75 0 0 0 .75-.75v-5.25a.75.75 0 0 0-.75-.75h-3Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function InvoiceIcon({ status }) {
  // Some legacy/API rows expose the tab status (`finalizada`) instead of the
  // visual status (`sent`). Keep both contracts visually equivalent.
  const visualStatus = status === 'finalizada' ? 'sent' : status
  const iconVariant = visualStatus === 'sent'
    ? 'finalized'
    : visualStatus === 'avulsa' || visualStatus === 'avulsa-finalizada' || visualStatus === 'avulsa-erro'
      ? 'avulsa'
      : visualStatus === 'on-time' || visualStatus === 'unknown'
        ? 'unknown'
        : null

  if (iconVariant) {
    const paths = {
      finalized: {
        main: 'M9 1.5H5.625c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0 0 16.5 9h-1.875a1.875 1.875 0 0 1-1.875-1.875V5.25A3.75 3.75 0 0 0 9 1.5Zm6.61 10.936a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 14.47a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z',
        corner: 'M12.971 1.816A5.23 5.23 0 0 1 14.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 0 1 3.434 1.279 9.768 9.768 0 0 0-6.963-6.963Z',
      },
      avulsa: {
        main: 'M5.625 1.5H9a3.75 3.75 0 0 1 3.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 0 1 3.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 0 1-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875ZM12.75 12a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V18a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V12Z',
        corner: 'M14.25 5.25a5.23 5.23 0 0 0-1.279-3.434 9.768 9.768 0 0 1 6.963 6.963A5.23 5.23 0 0 0 16.5 7.5h-1.875a.375.375 0 0 1-.375-.375V5.25Z',
      },
      unknown: {
        main: 'M5.625 1.5H9a3.75 3.75 0 0 1 3.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 0 1 3.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 0 1-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875Zm6 16.5c.66 0 1.277-.19 1.797-.518l1.048 1.048a.75.75 0 0 0 1.06-1.06l-1.047-1.048A3.375 3.375 0 1 0 11.625 18Z',
        corner: 'M14.25 5.25a5.23 5.23 0 0 0-1.279-3.434 9.768 9.768 0 0 1 6.963 6.963A5.23 5.23 0 0 0 16.5 7.5h-1.875a.375.375 0 0 1-.375-.375V5.25Z',
        marker: 'M11.625 16.5a1.875 1.875 0 1 0 0-3.75 1.875 1.875 0 0 0 0 3.75Z',
      },
    }[iconVariant]

    return (
      <svg
        className={`document-glyph is-${visualStatus}`}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        {paths.marker && <path d={paths.marker} />}
        <path fillRule="evenodd" d={paths.main} clipRule="evenodd" />
        <path d={paths.corner} />
      </svg>
    )
  }

  return (
    <svg
      className={`document-glyph is-${visualStatus}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.625 1.5H9a3.75 3.75 0 0 1 3.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 0 1 3.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 0 1-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875ZM9.75 14.25a.75.75 0 0 0 0 1.5H15a.75.75 0 0 0 0-1.5H9.75Z"
        clipRule="evenodd"
      />
      <path d="M14.25 5.25a5.23 5.23 0 0 0-1.279-3.434 9.768 9.768 0 0 1 6.963 6.963A5.23 5.23 0 0 0 16.5 7.5h-1.875a.375.375 0 0 1-.375-.375V5.25Z" />
    </svg>
  )
}

function NfdActionIcon({ name }) {
  const commonProps = {
    className: 'nfd-action-icon',
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    'aria-hidden': 'true',
  }

  if (name === 'invoice') {
    return (
      <svg {...commonProps}>
        <path fillRule="evenodd" d="M9 1.5H5.625c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0 0 16.5 9h-1.875a1.875 1.875 0 0 1-1.875-1.875V5.25A3.75 3.75 0 0 0 9 1.5Zm6.61 10.936a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 14.47a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
        <path d="M12.971 1.816A5.23 5.23 0 0 1 14.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 0 1 3.434 1.279 9.768 9.768 0 0 0-6.963-6.963Z" />
      </svg>
    )
  }

  if (name === 'unknown') {
    return (
      <svg {...commonProps}>
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
      </svg>
    )
  }

  if (name === 'fstd') {
    return (
      <svg {...commonProps}>
        <path d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32l8.4-8.4Z" />
        <path d="M5.25 5.25a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3V13.5a.75.75 0 0 0-1.5 0v5.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V8.25a1.5 1.5 0 0 1 1.5-1.5h5.25a.75.75 0 0 0 0-1.5H5.25Z" />
      </svg>
    )
  }

  return null
}

function ProfileScreen({ profile, onBack, onLogout, onUploadPhoto, photoBusy }) {
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [isLogoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [isLoggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    let active = true

    if (!profile?.foto_url) {
      return () => {
        active = false
      }
    }

    getProfilePhotoSignedUrl(profile.foto_url)
      .then((url) => {
        if (active) setPhotoUrl(url)
      })
      .catch(() => {
        if (active) setPhotoUrl('')
      })

    return () => {
      active = false
    }
  }, [profile?.foto_url])

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onUploadPhoto) return

    setPhotoError('')

    try {
      const uploaded = await onUploadPhoto(file)
      setPhotoUrl(uploaded.signedUrl)
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Não foi possível atualizar a foto.')
    }
  }

  return (
    <main className="promotor-app profile-app">
      <AppHeader title="Perfil" onBack={onBack} />

      <section className="profile-screen-card" aria-label="Perfil do usuário">
        <div className="profile-user-summary">
          <label className={`profile-avatar-upload${photoBusy ? ' is-uploading' : ''}`} title="Adicionar ou alterar foto">
            <input
              accept="image/jpeg,image/png,image/webp"
              disabled={photoBusy}
              onChange={handlePhotoChange}
              type="file"
            />
            {photoUrl ? (
              <img src={photoUrl} alt="Foto do perfil" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <circle cx="12" cy="8" r="3.2" />
                <path strokeLinecap="round" d="M5.5 19.2c.8-3 3.1-4.6 6.5-4.6s5.7 1.6 6.5 4.6" />
              </svg>
            )}
          </label>

          <div className="profile-user-copy">
            <h1>{profile?.nome?.toUpperCase() ?? 'PROMOTOR'}</h1>
            <p>{profile?.email ?? '-'}</p>
          </div>
        </div>

        <div className="profile-divider" />

        <div className="profile-info-grid">
          <div className="profile-info-card">
            <span className="profile-info-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <circle cx="12" cy="8" r="3.2" />
                <path strokeLinecap="round" d="M5.5 19.2c.8-3 3.1-4.6 6.5-4.6s5.7 1.6 6.5 4.6" />
              </svg>
            </span>
            <span>
              <small>Perfil</small>
              <strong>{getProfileLabel(profile?.perfil ?? 'Promotor')}</strong>
            </span>
          </div>

          <div className="profile-info-card">
            <span className="profile-info-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 7 2.7v5.2c0 4.5-2.9 7.9-7 10.1-4.1-2.2-7-5.6-7-10.1V5.7L12 3Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.8 11.7 2.1 2.1 4.4-4.4" />
              </svg>
            </span>
            <span>
              <small>Estado</small>
              <strong>{profile?.estado ?? '-'}</strong>
            </span>
          </div>
        </div>

        {photoError && <strong className="profile-photo-error">{photoError}</strong>}

        <button className="profile-logout-button" type="button" onClick={() => setLogoutConfirmOpen(true)}>
          Sair
        </button>

        {isLogoutConfirmOpen && (
          <div className="profile-logout-confirm-layer" role="presentation">
            <button
              className="profile-logout-confirm-backdrop"
              type="button"
              aria-label="Fechar confirmação de saída"
              onClick={() => setLogoutConfirmOpen(false)}
            />
            <section className="profile-logout-confirm-card" role="dialog" aria-modal="true" aria-labelledby="profile-logout-confirm-title">
              <h2 id="profile-logout-confirm-title">Sair da conta?</h2>
              <p>Você precisará entrar novamente para acessar o aplicativo.</p>
              <div className="profile-logout-confirm-actions">
                <button
                  className="profile-logout-cancel-button"
                  type="button"
                  disabled={isLoggingOut}
                  onClick={() => setLogoutConfirmOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  className="profile-logout-confirm-button"
                  type="button"
                  disabled={isLoggingOut}
                  onClick={async () => {
                    setLoggingOut(true)
                    await onLogout()
                  }}
                >
                  {isLoggingOut ? 'Saindo...' : 'Sair'}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  )
}

export function StoresScreen({
  stores,
  nfds,
  loading,
  search,
  onSearch,
  onMenu,
  onCloseProfileMenu,
  onLogout,
  onUploadPhoto,
  photoBusy,
  profile,
  profileMenuOpen,
  profilePhoto,
  onOpenStore,
}) {
  const query = search.trim().toLowerCase()
  const filteredStores = filterBySearch(stores, query, ['nome', 'codigo', 'cidade', 'uf'])

  return (
    <main className="promotor-app">
      <AppHeader
        title="Lojas"
        showSupport
        onMenu={onMenu}
        onCloseProfileMenu={onCloseProfileMenu}
        onLogout={onLogout}
        onUploadPhoto={onUploadPhoto}
        photoBusy={photoBusy}
        profile={profile}
        profileMenuOpen={profileMenuOpen}
        profilePhoto={profilePhoto}
      />

      <section className="mobile-card stores-card">
        <SearchField className="mobile-search" value={search} onChange={onSearch} />

        {loading && <p className="mobile-muted">Carregando lojas...</p>}

        {!loading && filteredStores.length === 0 && (
          <p className="mobile-muted">Nenhuma loja vinculada ao seu usuário.</p>
        )}

        <div className="store-rows">
          {filteredStores.map((store) => {
            const storeNfds = nfds.filter((nfd) => nfd.loja_id === store.id)
            const overdueNotes = storeNfds.filter((nfd) => nfd.status_nfd === 'atrasada').length
    const pendingNotes = storeNfds.filter((nfd) => (
      nfd.visual_status === 'overdue' || nfd.visual_status === 'on-time'
    )).length
            const storeIconStatus = overdueNotes > 0 ? 'overdue' : 'clear'

            return (
              <button
                className="store-row"
                key={store.id}
                onClick={() => onOpenStore(store)}
                type="button"
              >
                <StoreIcon status={storeIconStatus} />
                <span>
                  <strong>{store.nome} - (cód av: {store.codigo})</strong>
                  <small>{pendingNotes} Notas Pendentes</small>
                </span>
                <b aria-hidden="true">›</b>
              </button>
            )
          })}
        </div>
      </section>
    </main>
  )
}

export function StoreDetailScreen({
  store,
  nfds,
  statusFilter,
  search,
  onSearch,
  onStatusFilter,
  onBack,
  onOpenNfd,
  onOpenAvulsa,
}) {
  const visibleNfds = filterBySearch(
    nfds.filter((nfd) => nfd.status_nfd === statusFilter),
    search,
    ['numero', 'data_emissao'],
  )
  const isPendingTab = statusFilter === 'atrasada'
  const hasSearch = search.trim().length > 0

  return (
    <main className="promotor-app">
      <AppHeader title={getStoreTitle(store)} onBack={onBack} />

      <nav className="mobile-tabs" aria-label="Status das notas">
        {statusTabs.map((status) => (
          <button
            className={statusFilter === status.id ? 'is-active' : ''}
            key={status.id}
            onClick={() => onStatusFilter(status.id)}
            type="button"
          >
            {status.label}
          </button>
        ))}
      </nav>

      <section className="store-detail-body">
        <SearchField className="mobile-search" value={search} onChange={onSearch} />

        {isPendingTab && visibleNfds.length === 0 && !hasSearch ? (
          <EmptyNotice>0 Notas Pendentes!</EmptyNotice>
        ) : (
          <>
            <div className="nfd-rows">
              {visibleNfds.map((nfd) => {
                const visualStatus = nfd.visual_status ?? getNfdVisualStatus(nfd)

                return (
                  <button
                    className={`nfd-row is-${visualStatus}`}
                    key={nfd.id}
                    type="button"
                    onClick={() => onOpenNfd(nfd)}
                  >
                    <InvoiceIcon status={visualStatus} />
                    <span className="nfd-summary">
                      <small>{formatDate(nfd.data_emissao)}</small>
                      <strong>NFD: {getNfdNumber(nfd)} ({formatMoney(nfd.valor_total)})</strong>
                      <em>GAL: {getBilledGal(nfd)} ovos - COD: {getBilledCod(nfd)} ovos</em>
                    </span>
                    <b aria-hidden="true">›</b>
                  </button>
                )
              })}
            </div>
            {visibleNfds.length === 0 && (
              <p className="mobile-muted nfd-search-empty">
                {hasSearch ? 'Nenhuma NFD encontrada para esta pesquisa.' : 'Nenhuma NFD encontrada.'}
              </p>
            )}
          </>
        )}

        <button className="avulsa-button" type="button" onClick={onOpenAvulsa}>
          + FSTD Avulsa
        </button>
      </section>
    </main>
  )
}

export function FstdAvulsaFlow({
  store,
  productsCatalog,
  catalogLoading,
  busy,
  error,
  initialStep = 'nfd',
  initialNfdForm,
  excludedProductKeys = [],
  isAddingProducts = false,
  onBack,
  onCreate,
}) {
  const [step, setStep] = useState(initialStep)
  const [nfdForm, setNfdForm] = useState(() => {
    const initial = initialNfdForm ?? {
      numero: '',
      valor: '',
      dataEmissao: getLocalIsoDate(),
    }

    return { ...initial, numero: keepNumericNfdCode(initial.numero) }
  })
  const [search, setSearch] = useState('')
  const [selectedProductKeys, setSelectedProductKeys] = useState([])
  const groupedProducts = useMemo(() => groupCatalogProducts(productsCatalog), [productsCatalog])
  const excludedKeys = new Set(excludedProductKeys)
  const availableProducts = groupedProducts.filter(
    (product) => !excludedKeys.has(getCatalogProductKey(product)),
  )
  const visibleProducts = filterBySearch(availableProducts, search, ['codigo_produto', 'nome', 'categoria', 'codigos_busca'])
  const canSelectProducts = selectedProductKeys.length > 0 && !busy

  function toggleProduct(productKey) {
    setSelectedProductKeys((current) => current.includes(productKey)
      ? current.filter((item) => item !== productKey)
      : [...current, productKey])
  }

  async function handleSubmitProducts(event) {
    event.preventDefault()
    if (!canSelectProducts) return

    await onCreate({
      ...nfdForm,
      produtos: availableProducts
        .filter((product) => selectedProductKeys.includes(getCatalogProductKey(product)))
        .flatMap((product) => product.codigos_produto.map((codigo) => ({
          codigo_produto: codigo,
          nome: product.nome,
          imagem_url: product.imagem_url,
        }))),
    })
  }

  if (step === 'nfd') {
    const canContinue = Boolean(
      nfdForm.numero.trim()
        && nfdForm.valor.trim()
        && Number(nfdForm.valor) >= 0
        && !busy,
    )

    return (
      <main className="promotor-app fstd-app avulsa-flow-page">
        <header className="avulsa-flow-topbar">
          <button type="button" onClick={onBack}>‹</button>
          <strong>FSTD Avulsa</strong>
          <span />
        </header>

        <section className="avulsa-flow-hero">
          <InvoiceIcon status="avulsa" />
          <div>
            <h1>NFD avulsa</h1>
            <p>Preencha os dados da nota para continuar.</p>
          </div>
        </section>

        <form
          className="avulsa-flow-card"
          onSubmit={(event) => {
            event.preventDefault()
            if (canContinue) setStep('products')
          }}
        >
          <div className="avulsa-flow-facts">
            <div>
              <span>Loja</span>
              <strong>{getStoreTitle(store)}</strong>
            </div>
            <div>
              <span>Código Loja</span>
              <strong>{getStoreCode(store)}</strong>
            </div>
            <div>
              <span>Data de emissão</span>
              <strong>{formatDate(nfdForm.dataEmissao)}</strong>
            </div>
          </div>

          <label className="avulsa-flow-field">
            <span>Código da NFD <small className="required-label">Obrigatório</small></span>
            <input
              autoComplete="off"
              inputMode="numeric"
              onChange={(event) => setNfdForm((current) => ({ ...current, numero: keepNumericNfdCode(event.target.value) }))}
              pattern="[0-9]*"
              type="text"
              placeholder="Informe o código da NFD"
              value={nfdForm.numero}
            />
          </label>

          <label className="avulsa-flow-field">
            <span>Valor <small className="required-label">Obrigatório</small></span>
            <div className="unit-input avulsa-value-input">
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) => setNfdForm((current) => ({ ...current, valor: event.target.value }))}
                placeholder="0,00"
                step="0.01"
                type="number"
                value={nfdForm.valor}
              />
              <em>R$</em>
            </div>
          </label>

          {error && <strong className="promotor-error">{error}</strong>}

          <button className="avulsa-primary-button" disabled={!canContinue} type="submit">
            Adicionar produto
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="promotor-app fstd-app avulsa-flow-page">
      <header className="avulsa-flow-topbar">
        <button type="button" onClick={() => (isAddingProducts ? onBack() : setStep('nfd'))}>‹</button>
        <strong>{isAddingProducts ? 'Adicionar mais produtos' : 'Adicionar produto'}</strong>
        <span />
      </header>

      <section className="avulsa-picker-intro">
        <h1>Produtos da nota</h1>
        <p>Selecione os produtos que aparecem na NFD avulsa.</p>
      </section>

      <form className="avulsa-picker-form" onSubmit={handleSubmitProducts}>
        <label className="mobile-search avulsa-picker-search">
          <span aria-hidden="true">⌕</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Procurar produto"
            type="search"
            value={search}
          />
        </label>

        {catalogLoading && <p className="fstd-empty">Carregando produtos...</p>}
        {!catalogLoading && visibleProducts.length === 0 && <p className="fstd-empty">Nenhum produto encontrado.</p>}

        <div className="avulsa-product-picker-list">
          {visibleProducts.map((product) => {
            const productKey = getCatalogProductKey(product)
            const selected = selectedProductKeys.includes(productKey)
            return (
              <label className={`avulsa-product-option${selected ? ' is-selected' : ''}`} key={productKey}>
                <input checked={selected} onChange={() => toggleProduct(productKey)} type="checkbox" />
                <ProductImage alt={product.nome} src={product.imagem_url} />
                <span>
                  <strong>{product.nome}</strong>
                </span>
                <i aria-hidden="true">{selected ? '✓' : ''}</i>
              </label>
            )
          })}
        </div>

        {error && <strong className="promotor-error">{error}</strong>}

        <button className="avulsa-primary-button" disabled={!canSelectProducts} type="submit">
          {busy ? 'Adicionando...' : 'Adicionar produto'}
        </button>
      </form>
    </main>
  )
}

function UnknownNfdSheet({ open, comment, busy, error, onChange, onClose, onSubmit }) {
  if (!open) return null

  const trimmedComment = comment.trim()
  const canSubmit = trimmedComment.length >= 5 && !busy

  return (
    <div className="unknown-nfd-layer">
      <button className="unknown-nfd-backdrop" type="button" aria-label="Fechar formulário" onClick={onClose} />
      <section className="unknown-nfd-sheet" role="dialog" aria-modal="true" aria-labelledby="unknown-nfd-title">
        <div className="unknown-nfd-handle" aria-hidden="true" />
        <header>
          <h2 id="unknown-nfd-title">Desconhecer NFD</h2>
          <button type="button" aria-label="Fechar formulário" onClick={onClose}>×</button>
        </header>

        <p className="unknown-nfd-warning">Não reconheço a procedência desta NFD.</p>

        <label className="unknown-nfd-comment">
          <span>Comentário <small className="required-label">Obrigatório</small></span>
          <textarea
            value={comment}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Explique por que você não reconhece esta NFD"
            rows="4"
          />
        </label>

        {error && <strong className="promotor-error">{error}</strong>}

        <footer>
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="button" disabled={!canSubmit} onClick={onSubmit}>
            {busy ? 'Enviando' : 'Enviar'}
          </button>
        </footer>
      </section>
    </div>
  )
}

function NfdConferenceErrorPopup({ nfd, onClose }) {
  if (!nfd) return null

  return (
    <div className="nfd-conference-layer">
      <button className="nfd-conference-backdrop" type="button" aria-label="Fechar alerta" onClick={onClose} />
      <section className="nfd-conference-dialog" role="alertdialog" aria-modal="true" aria-labelledby="nfd-conference-title">
        <InvoiceIcon status="avulsa-erro" />
        <h2 id="nfd-conference-title">Erro na NFD</h2>
        <p>A NFD “{getNfdNumber(nfd)}” deu erro, entre em contato com o suporte.</p>
        <button type="button" onClick={onClose}>Entendi</button>
      </section>
    </div>
  )
}

function NfdDetailScreen({ store, nfd, onBack, onOpenInvoice, onOpenFstd, onMarkUnknown, unknownBusy, unknownError }) {
  const [invoiceCopied, setInvoiceCopied] = useState(false)
  const [isUnknownOpen, setUnknownOpen] = useState(false)
  const [unknownComment, setUnknownComment] = useState('')
  const visualStatus = nfd.visual_status ?? getNfdVisualStatus(nfd)
  const returnRates = getNfdReturnRates(nfd)
  const isFinalized = visualStatus === 'sent'
    || visualStatus === 'avulsa-finalizada'
    || nfd.status_nfd === 'finalizada'
  const isUnknown = visualStatus === 'unknown' || nfd.status_nfd === 'outros'

  function handleOpenInvoice() {
    onOpenInvoice()

    void copyToClipboard(String(nfd?.chave_acesso ?? '').trim())
      .then((copied) => setInvoiceCopied(copied))
      .catch(() => setInvoiceCopied(false))
  }

  return (
    <main className="promotor-app">
      <AppHeader title={getStoreCode(store, nfd) + ' - ' + getNfdNumber(nfd)} onBack={onBack} />

      <section className="nfd-detail-card">
        <div className="nfd-detail-heading">
          <InvoiceIcon status={visualStatus} />
          <div>
            <strong>NFD: {getNfdNumber(nfd)} ({formatMoney(nfd.valor_total)})</strong>
            <small>{getStoreTitle(store)}</small>
          </div>
        </div>

        <dl className="nfd-facts">
          <div>
            <dt>Loja</dt>
            <dd>{getStoreTitle(store)}</dd>
          </div>
          <div>
            <dt>Código Loja</dt>
            <dd>{getStoreCode(store, nfd)}</dd>
          </div>
          <div>
            <dt>NFD</dt>
            <dd>{nfd.numero}</dd>
          </div>
          <div>
            <dt>Data da Emissão</dt>
            <dd>{formatDate(nfd.data_emissao)}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd>{formatMoney(nfd.valor_total)}</dd>
          </div>
          <div>
            <dt>Faturado GAL</dt>
            <dd>{getBilledGal(nfd)} ovos</dd>
          </div>
          <div>
            <dt>Faturado COD</dt>
            <dd>{getBilledCod(nfd)} ovos</dd>
          </div>
        </dl>

        <div className={`nfd-actions${nfd.is_avulsa ? ' is-avulsa' : ''}`}>
          {!nfd.is_avulsa && (
            <button
              type="button"
              onClick={handleOpenInvoice}
            >
              <NfdActionIcon name="invoice" />
              Nota Fiscal
            </button>
          )}
          {!nfd.is_avulsa && !isFinalized && !isUnknown && (
            <button className="unknown-nfd-button" type="button" onClick={() => setUnknownOpen(true)}>
              <NfdActionIcon name="unknown" />
              Desconheço NFD
            </button>
          )}
          <button type="button" onClick={() => onOpenFstd(nfd)}>
            <NfdActionIcon name="fstd" />
            FSTD
          </button>
        </div>

        {invoiceCopied && <p className="copy-feedback" role="status">Chave de acesso copiada.</p>}
      </section>

      {isFinalized && (
        <section className="nfd-return-card" aria-label="Percentual de retorno">
          {[
            ['Galinha', returnRates.galinha],
            ['Codorna', returnRates.codorna],
          ].map(([label, percentage]) => (
            <div className="nfd-return-item" key={label}>
              <div className="nfd-return-label">
                <strong>% Retorno {label}</strong>
                <span>{formatReturnPercentage(percentage)} %</span>
              </div>
              <div className="nfd-return-track" aria-hidden="true">
                <span style={{ width: `${percentage}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}

      <UnknownNfdSheet
        open={isUnknownOpen}
        comment={unknownComment}
        busy={unknownBusy}
        error={unknownError}
        onChange={setUnknownComment}
        onClose={() => setUnknownOpen(false)}
        onSubmit={async () => {
          await onMarkUnknown(nfd, unknownComment.trim())
          setUnknownOpen(false)
          setUnknownComment('')
        }}
      />
    </main>
  )
}

function FstdSectionIcon({ type }) {
  if (type === 'chart') {
    return (
      <svg className="fstd-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V9m5 10V5m6 14v-7m5 7V3" />
      </svg>
    )
  }

  return (
    <svg className="fstd-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8m-7-2h6v4H7V2h2Zm-3 4h10a2 2 0 0 1 2 2v12H5V8a2 2 0 0 1 2-2Z" />
      <path strokeLinecap="round" d="M8 11h8M8 15h5" />
    </svg>
  )
}

function FieldCard({ title, icon, required = false, className = '', children }) {
  return (
    <section className={`fstd-card${className ? ` ${className}` : ''}`}>
      <h2>
        {icon && <FstdSectionIcon type={icon} />}
        <span>{title}</span>
        {required && <small aria-label="Obrigatório" className="fstd-required-label">*</small>}
      </h2>
      {children}
    </section>
  )
}

export function LegacyFstdScreen({ store, nfd, motivos, busy, error, onBack, onSubmit }) {
  const [form, setForm] = useState(() => ({
    ...initialFstdForm,
    gal: nfd ? '' : '',
    cod: nfd ? '' : '',
  }))
  const totalReturn = normalizeQuantity(form.gal) + normalizeQuantity(form.cod)
  const canSubmit = Boolean(store && form.motivoId && totalReturn > 0 && !busy)

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    const observacao = [
      form.notaVenda.trim() ? `Nota de venda: ${form.notaVenda.trim()}` : '',
      form.lotes.trim() ? `Lotes: ${form.lotes.trim()}` : '',
    ].filter(Boolean).join('\n')

    onSubmit({
      p_loja_id: store.id,
      p_motivo_id: form.motivoId,
      p_nfd_id: nfd?.id ?? null,
      p_quantidade_gal: normalizeQuantity(form.gal),
      p_quantidade_cod: normalizeQuantity(form.cod),
      p_quantidade_siu: 0,
      p_fotos: [],
      p_observacao: observacao || null,
    })
  }

  return (
    <main className="promotor-app fstd-app">
      <form className="fstd-mobile-form" onSubmit={handleSubmit}>
        <header className="fstd-topbar">
          <button type="button" onClick={onBack}>Cancelar</button>
          <strong>{nfd?.numero ?? 'Avulsa'}</strong>
          <button type="submit" disabled={!canSubmit}>
            {busy ? 'Enviando...' : 'Enviar'}
          </button>
        </header>

        <section className="fstd-hero">
          <img src={avineLogo} alt="Avine" />
          <div>
            <span>Nº Controle: {nfd?.numero ?? 'Avulsa'}</span>
            <h1>{getStoreTitle(store)}</h1>
            <p>NFD: {nfd?.numero ?? 'Avulsa'} / CÓD: {getStoreCode(store, nfd)}</p>
            <p>RESPONSÁVEL: {store?.responsavel ?? '-'}</p>
          </div>
        </section>

        <div className="fstd-form-body">
          <FieldCard title="Devolução">
            <label className="mobile-field">
              <span>
                Motivo
                <small className="required-label">Obrigatório</small>
              </span>
              <AppSelect
                searchable
                value={form.motivoId}
                onChange={(event) => updateForm({ motivoId: event.target.value })}
              >
                <option value="">Selecione</option>
                {motivos.map((motivo) => (
                  <option key={motivo.id} value={motivo.id}>
                    {motivo.nome}
                  </option>
                ))}
              </AppSelect>
            </label>
          </FieldCard>

          <FieldCard title="Galinha">
            <label className="mobile-field">
              <span>Faturado</span>
              <input disabled value={nfd ? `${getBilledGal(nfd)} ovos` : '0 ovos'} />
            </label>
            <label className="mobile-field">
              <span>
                Retorno
                <small className="required-label">Obrigatório</small>
              </span>
              <div className="unit-input">
                <input
                  min="0"
                  inputMode="numeric"
                  onChange={(event) => updateForm({ gal: event.target.value })}
                  type="number"
                  value={form.gal}
                />
                <em>ovos</em>
              </div>
            </label>
          </FieldCard>

          <FieldCard title="Codorna">
            <label className="mobile-field">
              <span>Faturado</span>
              <input disabled value={nfd ? `${getBilledCod(nfd)} ovos` : '0 ovos'} />
            </label>
            <label className="mobile-field">
              <span>
                Retorno
                <small className="required-label">Obrigatório</small>
              </span>
              <div className="unit-input">
                <input
                  min="0"
                  inputMode="numeric"
                  onChange={(event) => updateForm({ cod: event.target.value })}
                  type="number"
                  value={form.cod}
                />
                <em>ovos</em>
              </div>
            </label>
          </FieldCard>

          <FieldCard required title="Fotos">
            <label className="photo-button">
              <input
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => updateForm({ fotos: Array.from(event.target.files ?? []) })}
                type="file"
              />
              Envio de imagens
            </label>
            {form.fotos.length > 0 && <p className="photo-count">{form.fotos.length} foto(s) selecionada(s)</p>}
          </FieldCard>

          <FieldCard title="Adicional">
            <label className="mobile-field">
              <span>Nota de Venda</span>
              <input value={form.notaVenda} onChange={(event) => updateForm({ notaVenda: event.target.value })} />
            </label>
            <label className="mobile-field">
              <span>Lotes</span>
              <textarea value={form.lotes} onChange={(event) => updateForm({ lotes: event.target.value })} rows="3" />
            </label>
          </FieldCard>

          {error && <strong className="promotor-error">{error}</strong>}
        </div>

      </form>
    </main>
  )
}

function ProductImage({ src, alt, className = '' }) {
  const [imageState, setImageState] = useState({ src: '', index: 0 })
  const normalizedSrc = String(src ?? '').trim()
  const imageCandidates = getProductImageCandidates(normalizedSrc)
  const candidateIndex = imageState.src === normalizedSrc ? imageState.index : 0

  if (imageCandidates.length === 0 || candidateIndex >= imageCandidates.length) {
    return <div className={`fstd-product-image fstd-product-image-placeholder ${className}`}>Sem imagem</div>
  }

  return (
    <img
      alt={alt}
      className={`fstd-product-image ${className}`}
      decoding="async"
      key={`${normalizedSrc}-${candidateIndex}`}
      onError={() => setImageState((current) => ({
        src: normalizedSrc,
        index: (current.src === normalizedSrc ? current.index : 0) + 1,
      }))}
      referrerPolicy="no-referrer"
      src={imageCandidates[candidateIndex]}
    />
  )
}

function getFstdDivisionDefaults(product) {
  const persistedDivisions = Array.isArray(product.persisted?.divisoes)
    ? product.persisted.divisoes
      .filter((division) => division?.motivo_id && normalizeQuantity(division.quantidade_faturada ?? division.quantidade) > 0)
      .map((division) => ({
        motivoId: division.motivo_id,
        faturado: String(normalizeQuantity(division.quantidade_faturada ?? division.quantidade)),
        retorno: String(normalizeQuantity(division.quantidade_retorno ?? division.quantidade)),
      }))
    : []

  if (persistedDivisions.length > 0) return persistedDivisions

  if (product.persisted?.motivo_id && (product.persisted.quantidade_faturada_galinha + product.persisted.quantidade_faturada_codorna) > 0) {
    return [{
      motivoId: product.persisted.motivo_id,
      faturado: String(product.persisted.quantidade_faturada_galinha + product.persisted.quantidade_faturada_codorna),
      retorno: String(normalizeQuantity(product.persisted.quantidade_retorno)),
    }]
  }

  const totalBilled = Number(product.quantidade_faturada_galinha ?? 0)
    + Number(product.quantidade_faturada_codorna ?? 0)

  return [{ motivoId: '', faturado: String(Math.max(0, totalBilled)), retorno: '' }]
}

function getFstdStoredPhotoPaths(product) {
  return Array.isArray(product.persisted?.fotos)
    ? product.persisted.fotos.filter((path) => typeof path === 'string' && path.trim())
    : []
}

function readFstdPhotoPreview(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve({
      file,
      url: typeof reader.result === 'string' ? reader.result : '',
    })
    reader.onerror = () => resolve({ file, url: '' })
    reader.readAsDataURL(file)
  })
}

function createFstdPhotoPreviews(files) {
  return Promise.all((Array.isArray(files) ? files : []).map(readFstdPhotoPreview))
}

function cleanLegacyPhotoObservation(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*Fotos selecionadas\s*:/i.test(line))
    .join('\n')
    .trim()
}

async function getFstdPhotoUrls(process) {
  const paths = [...new Set((process?.produtos ?? []).flatMap((product) => (
    Array.isArray(product.fotos) ? product.fotos : []
  )))]

  return Promise.all(paths.map(async (path) => {
    if (/^https?:\/\//i.test(path)) return { path, url: path }

    const { data, error } = await supabase.storage
      .from('fstd-fotos')
      .createSignedUrl(path, 3600)

    return { path, url: error ? '' : data?.signedUrl ?? '' }
  }))
}

function getEditableObservation(value) {
  return cleanLegacyPhotoObservation(String(value ?? '').replace(/^(?:Observações:\s*)+/i, ''))
}

function FstdPhotoLightbox({ photo, onClose }) {
  if (!photo) return null

  return (
    <div className="fstd-photo-lightbox" role="dialog" aria-modal="true" aria-label="Visualizar foto enviada">
      <button className="fstd-photo-lightbox-backdrop" onClick={onClose} type="button" aria-label="Fechar foto" />
      <section className="fstd-photo-lightbox-dialog">
        <header className="fstd-photo-lightbox-header">
          <div>
            <strong>Foto enviada</strong>
            <span>{photo.associationLabel || 'Foto da NFD'}</span>
          </div>
          <button onClick={onClose} type="button" aria-label="Fechar foto">×</button>
        </header>
        <div className="fstd-photo-lightbox-content">
          {photo.url ? <img alt={photo.alt || 'Foto enviada'} src={photo.url} /> : <span>Foto indisponível</span>}
        </div>
      </section>
    </div>
  )
}

function FstdStoredPhotos({ paths, removable = false, onRemove, associationLabel = 'Produto da FSTD' }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const photoQuery = useQuery({
    queryKey: ['promotor', 'fstd-stored-photos', paths],
    enabled: paths.length > 0,
    queryFn: async () => {
      const results = await Promise.all(paths.map(async (path) => {
        if (/^https?:\/\//i.test(path)) return { path, url: path }

        const { data, error } = await supabase.storage
          .from('fstd-fotos')
          .createSignedUrl(path, 3600)

        return { path, url: error ? '' : data?.signedUrl ?? '' }
      }))

      return results
    },
  })

  if (paths.length === 0) return null

  return (
    <>
      <div className="fstd-photo-previews fstd-stored-photo-previews">
        {(photoQuery.data ?? paths.map((path) => ({ path, url: '' }))).map((photo, index) => (
          <div
            className="fstd-photo-preview fstd-stored-photo-preview"
            key={photo.path}
            onClick={() => setSelectedPhoto({ ...photo, alt: `Foto enviada ${index + 1}`, associationLabel })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setSelectedPhoto({ ...photo, alt: `Foto enviada ${index + 1}`, associationLabel })
              }
            }}
            role="button"
            tabIndex={0}
          >
            {photo.url ? <img alt={`Foto enviada ${index + 1}`} src={photo.url} /> : <span>Foto</span>}
            {removable && (
              <button aria-label={`Remover foto ${index + 1}`} onClick={(event) => { event.stopPropagation(); onRemove?.(photo.path) }} type="button">×</button>
            )}
          </div>
        ))}
      </div>
      <FstdPhotoLightbox photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
    </>
  )
}

function FstdProductForm({ product, motivos, busy, error, onBack, onClose, embeddedFstd = false, allowFinalizedEdit = false, initialDraft = null, onSubmit }) {
  const isAvulsa = Boolean(product.is_avulsa)
  const isEditing = product.persisted?.status === 'concluido'
  const [form, setForm] = useState(() => {
    const draftDivisions = Array.isArray(initialDraft?.divisoes)
      ? initialDraft.divisoes.map((division) => ({
        motivoId: division.motivoId ?? '',
        faturado: String(division.faturado ?? ''),
        retorno: String(division.retorno ?? ''),
      }))
      : []

    return {
      ...initialFstdForm,
      divisoes: draftDivisions.length > 0 ? draftDivisions : getFstdDivisionDefaults(product),
      faturadoGalinha: initialDraft?.faturadoGalinha != null
        ? String(initialDraft.faturadoGalinha)
        : String(getProductBilledQuantity(product, 'galinha')),
      faturadoCodorna: initialDraft?.faturadoCodorna != null
        ? String(initialDraft.faturadoCodorna)
        : String(getProductBilledQuantity(product, 'codorna')),
      fotos: Array.isArray(initialDraft?.fotos) ? initialDraft.fotos : [],
      fotosPreviews: Array.isArray(initialDraft?.fotosPreviews) ? initialDraft.fotosPreviews : [],
      fotosExistentes: Array.isArray(initialDraft?.fotosExistentes)
        ? initialDraft.fotosExistentes
        : isEditing ? getFstdStoredPhotoPaths(product) : [],
      lotes: initialDraft?.lotes ?? (isEditing ? getEditableObservation(product.persisted?.observacao) : ''),
    }
  })
  const photoPreviews = form.fotosPreviews
  const billedGalinha = isAvulsa
    ? normalizeQuantity(form.faturadoGalinha)
    : getProductBilledQuantity(product, 'galinha')
  const billedCodorna = isAvulsa
    ? normalizeQuantity(form.faturadoCodorna)
    : getProductBilledQuantity(product, 'codorna')
  const totalBilled = billedGalinha + billedCodorna
  const totalDatabaseBilled = isAvulsa
    ? totalBilled
    : Number(product.quantidade_faturada_galinha ?? 0) + Number(product.quantidade_faturada_codorna ?? 0)
  const totalDivisionBilled = form.divisoes.reduce((total, division) => total + normalizeQuantity(division.faturado), 0)
  const totalReturn = form.divisoes.reduce((total, division) => total + normalizeNonNegativeQuantity(division.retorno), 0)
  const remainingBilled = Math.max(0, totalBilled - totalDivisionBilled)
  const remainingDatabaseBilled = Math.max(0, totalDatabaseBilled - totalDivisionBilled)
  const showGeneral = true
  const hasPhotos = form.fotos.length > 0 || form.fotosExistentes.length > 0
  const avulsaQuantitiesAreFilled = !isAvulsa || (
    String(form.faturadoGalinha).trim() !== ''
      && String(form.faturadoCodorna).trim() !== ''
  )
  const divisionsAreValid = form.divisoes.every(
    (division) => Boolean(division.motivoId)
      && normalizeQuantity(division.faturado) > 0
      && String(division.retorno).trim() !== ''
      && normalizeNonNegativeQuantity(division.retorno) <= normalizeQuantity(division.faturado),
  )
  const canSubmit = Boolean(
    totalBilled > 0
      && avulsaQuantitiesAreFilled
      && divisionsAreValid
      && totalDivisionBilled === totalBilled
      && hasPhotos
      && !busy,
  )

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }))
  }

  async function updatePhotos(files) {
    updateForm({
      fotos: files,
      fotosPreviews: await createFstdPhotoPreviews(files),
    })
  }

  function updateAvulsaBilled(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value }
      if (current.divisoes.length === 1) {
        const galinha = field === 'faturadoGalinha' ? normalizeQuantity(value) : normalizeQuantity(current.faturadoGalinha)
        const codorna = field === 'faturadoCodorna' ? normalizeQuantity(value) : normalizeQuantity(current.faturadoCodorna)
        next.divisoes = [{ ...current.divisoes[0], faturado: String(galinha + codorna || '') }]
      }
      return next
    })
  }

  function updateDivision(index, patch) {
    setForm((current) => ({
      ...current,
      divisoes: current.divisoes.map((division, divisionIndex) => (
        divisionIndex === index ? { ...division, ...patch } : division
      )),
    }))
  }

  function addDivision() {
    if (remainingBilled <= 0) return
    setForm((current) => ({
      ...current,
      divisoes: [...current.divisoes, { motivoId: '', faturado: '', retorno: '' }],
    }))
  }

  function removeDivision(indexToRemove) {
    setForm((current) => ({
      ...current,
      divisoes: current.divisoes.filter((_, index) => index !== indexToRemove),
    }))
  }

  function removePhoto(indexToRemove) {
    setForm((current) => ({
      ...current,
      fotos: current.fotos.filter((_, index) => index !== indexToRemove),
      fotosPreviews: current.fotosPreviews.filter((_, index) => index !== indexToRemove),
    }))
  }

  function removeStoredPhoto(pathToRemove) {
    setForm((current) => ({
      ...current,
      fotosExistentes: current.fotosExistentes.filter((path) => path !== pathToRemove),
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return

    const observacao = form.lotes.trim()

    await onSubmit({
      product,
      divisoes: form.divisoes.map((division) => ({
        motivoId: division.motivoId,
        faturado: normalizeQuantity(division.faturado),
        retorno: normalizeNonNegativeQuantity(division.retorno),
      })),
      observacao: observacao || null,
      fotos: form.fotos,
      fotosExistentes: form.fotosExistentes,
      faturadoGalinha: normalizeQuantity(form.faturadoGalinha),
      faturadoCodorna: normalizeQuantity(form.faturadoCodorna),
    })
  }

  return (
    <main className={`promotor-app fstd-app fstd-product-page${isAvulsa ? ' is-avulsa' : ''}`}>
      <form className="fstd-mobile-form fstd-product-form" onSubmit={handleSubmit}>
        <header className="fstd-topbar">
          <button type="button" onClick={onBack}>‹</button>
          {embeddedFstd ? <strong>{allowFinalizedEdit ? 'Editar NFD' : 'Preencher NFD'}</strong> : <span />}
          {embeddedFstd
            ? <button className="fstd-product-close" type="button" onClick={onClose} aria-label="Fechar preenchimento">×</button>
            : <button type="submit" disabled={!canSubmit}>{busy ? 'Enviando' : isEditing ? 'Salvar' : 'Concluir'}</button>}
        </header>

        <section className="fstd-product-hero">
          <ProductImage alt={product.nome} src={product.imagem_url || product.persisted?.imagem_url} />
          <div>
            <h1>{product.nome}</h1>
            <p>{product.codigo_produto}</p>
            <small>{product.descricao}</small>
          </div>
        </section>

        <div className="fstd-form-body">
          <FieldCard title="Devolução">
            {form.divisoes.map((division, index) => (
              <div className="fstd-reason-row" data-motivo={index + 1} key={`division-${index}`}>
                <label className="mobile-field">
                  <span>
                    {index === 0 ? 'Motivo' : `Outro motivo ${index + 1}`}
                    <small aria-label="Obrigatório" className="required-label">*</small>
                  </span>
                  <AppSelect required searchable value={division.motivoId} onChange={(event) => updateDivision(index, { motivoId: event.target.value })}>
                    <option value="">Selecione</option>
                    {motivos.filter((motivo) => motivo.ativo || motivo.id === division.motivoId).map((motivo) => (
                      <option
                        disabled={form.divisoes.some((other, otherIndex) => otherIndex !== index && other.motivoId === motivo.id)}
                        key={motivo.id}
                        value={motivo.id}
                      >
                        {motivo.nome}
                      </option>
                    ))}
                  </AppSelect>
                </label>
                <label className="mobile-field">
                  <span>Faturado <small aria-label="Obrigatório" className="required-label">*</small></span>
                  <div className="unit-input">
                    <input
                      max={Math.max(0, totalBilled - (totalDivisionBilled - normalizeQuantity(division.faturado)))}
                      min="1"
                      inputMode="numeric"
                      onChange={(event) => updateDivision(index, { faturado: event.target.value })}
                      required
                      type="number"
                      value={division.faturado}
                    />
                    <em>ovos</em>
                  </div>
                </label>
                <label className="mobile-field">
                  <span>Retorno <small aria-label="Obrigatório" className="required-label">*</small></span>
                  <div className="unit-input">
                    <input
                      max={normalizeQuantity(division.faturado)}
                      min="0"
                      inputMode="numeric"
                      onChange={(event) => updateDivision(index, { retorno: event.target.value })}
                      required
                      type="number"
                      value={division.retorno}
                    />
                    <em>ovos</em>
                  </div>
                </label>
                {index > 0 && (
                  <button className="fstd-remove-reason" onClick={() => removeDivision(index)} type="button">
                    Remover motivo
                  </button>
                )}
              </div>
            ))}
            {!isAvulsa && totalDivisionBilled > 0 && remainingBilled > 0 && (
              <button className="fstd-add-reason" onClick={addDivision} type="button">
                + Adicionar outro motivo
              </button>
            )}
            {totalDivisionBilled > totalBilled && (
              <strong className="fstd-quantity-error">A soma dos faturados por motivo não pode passar do faturado geral.</strong>
            )}
            {totalReturn > totalBilled && (
              <strong className="fstd-quantity-error">A quantidade de retorno não pode passar do faturado.</strong>
            )}
          </FieldCard>

          {showGeneral && (
            <FieldCard
              className={!isAvulsa
                ? `fstd-billing-card${remainingDatabaseBilled > 0 ? ' is-warning' : ' is-complete'}`
                : ''}
              icon="chart"
              title={isAvulsa ? 'Geral' : 'Faturamento'}
            >
              {isAvulsa ? (
                <>
                  <p className="fstd-avulsa-hint">Informe aqui a quantidade faturada na NFD física.</p>
                  <label className="mobile-field">
                    <span>Faturado Galinha</span>
                    <div className="unit-input">
                      <input
                        min="0"
                        inputMode="numeric"
                        onChange={(event) => updateAvulsaBilled('faturadoGalinha', event.target.value)}
                        required
                        type="number"
                        value={form.faturadoGalinha}
                      />
                      <em>ovos</em>
                    </div>
                  </label>
                  <label className="mobile-field">
                    <span>Faturado Codorna</span>
                    <div className="unit-input">
                      <input
                        min="0"
                        inputMode="numeric"
                        onChange={(event) => updateAvulsaBilled('faturadoCodorna', event.target.value)}
                        required
                        type="number"
                        value={form.faturadoCodorna}
                      />
                      <em>ovos</em>
                    </div>
                  </label>
                </>
              ) : (
                <div className="fstd-quantity-gap">
                  <strong>{totalDivisionBilled} / {totalDatabaseBilled} <small>ovos</small></strong>
                  <small>Faltam {remainingDatabaseBilled} ovos</small>
                </div>
              )}
            </FieldCard>
          )}

          <FieldCard required title="Fotos">
            <label className="photo-button">
              <input
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => { void updatePhotos(Array.from(event.target.files ?? [])) }}
                required={!hasPhotos}
                type="file"
              />
              Envio de imagens
            </label>
            <FstdStoredPhotos paths={form.fotosExistentes} onRemove={removeStoredPhoto} removable={isEditing} />
            {photoPreviews.length > 0 && (
              <div className="fstd-photo-previews">
                {photoPreviews.map((preview, index) => (
                  <div className="fstd-photo-preview" key={`${preview.file.name}-${index}`}>
                    <img alt={`Pré-visualização de ${preview.file.name}`} src={preview.url} />
                    <button aria-label={`Remover ${preview.file.name}`} onClick={() => removePhoto(index)} type="button">×</button>
                  </div>
                ))}
              </div>
            )}
          </FieldCard>

          <FieldCard title="Observações">
            <textarea value={form.lotes} onChange={(event) => updateForm({ lotes: event.target.value })} rows="4" />
          </FieldCard>

          {error && <strong className="promotor-error">{error}</strong>}
        </div>

        <footer className="fstd-product-actions">
          <button type="button" onClick={onBack}>Cancelar</button>
          <button type="submit" disabled={!canSubmit}>
            {busy ? isEditing ? 'Salvando...' : 'Enviando...' : isEditing ? 'Salvar' : 'Enviar'}
          </button>
        </footer>
      </form>
    </main>
  )
}

function FstdProductSummary({ store, nfd, product, motivos, canEdit, editingFinalized = false, error, onBack, onEdit }) {
  const motivoById = new Map(motivos.map((motivo) => [motivo.id, motivo.nome]))
  const divisions = product.persisted?.divisoes?.length > 0
    ? product.persisted.divisoes
    : product.persisted?.motivo_id
      ? [{ motivo_id: product.persisted.motivo_id, quantidade: product.persisted.quantidade_retorno }]
      : []
  const totalBilled = Number(product.persisted?.quantidade_faturada_galinha ?? product.quantidade_faturada_galinha ?? 0)
    + Number(product.persisted?.quantidade_faturada_codorna ?? product.quantidade_faturada_codorna ?? 0)
  const storedPhotoPaths = getFstdStoredPhotoPaths(product)

  return (
    <main className="promotor-app fstd-app fstd-summary-page">
      <header className="fstd-list-topbar">
        <button type="button" onClick={onBack}>‹</button>
        <strong>{editingFinalized ? 'Editar NFD' : 'FSTD'}</strong>
        <span />
      </header>

      <section className="fstd-list-hero">
        <img src={avineLogo} alt="Avine" />
        <div>
          <h1>{getStoreTitle(store)}</h1>
          <p>NFD: {getNfdNumber(nfd)} / CÓD: {getStoreCode(store, nfd)}</p>
        </div>
      </section>

      <div className="fstd-summary-body">
        <button className="fstd-summary-product" onClick={canEdit ? onEdit : undefined} type="button">
          <ProductImage alt={product.nome} src={product.imagem_url || product.persisted?.imagem_url} />
          <span>
            <strong>{product.nome}</strong>
            <small>{product.codigo_produto}</small>
          </span>
          {canEdit && <span className="fstd-summary-edit-icon">›</span>}
        </button>

        <section className="fstd-summary-card">
          <h2>Informações do FSTD</h2>
          <div className="fstd-summary-field">
            <span>Motivo</span>
            <div>
              {divisions.length > 0
                ? divisions.map((division) => (
                  <strong key={`${division.motivo_id}-${division.quantidade_faturada}-${division.quantidade}`}>
                    {motivoById.get(division.motivo_id) ?? 'Motivo não encontrado'}: {division.quantidade} ovos
                  </strong>
                ))
                : <strong>Não informado</strong>}
            </div>
          </div>
          <div className="fstd-summary-field">
            <span>Faturado</span>
            <strong>{totalBilled} ovos</strong>
          </div>
          <div className="fstd-summary-field">
            <span>Divisão por motivo</span>
            <div>
              {divisions.length > 0
                ? divisions.map((division) => (
                  <strong key={`summary-${division.motivo_id}-${division.quantidade_faturada}-${division.quantidade}`}>
                    {motivoById.get(division.motivo_id) ?? 'Motivo'}: Faturado {division.quantidade_faturada ?? division.quantidade} · Retorno {division.quantidade}
                  </strong>
                ))
                : <strong>Não informado</strong>}
            </div>
          </div>
          <div className="fstd-summary-field">
            <span>Retorno</span>
            <strong>{product.persisted?.quantidade_retorno ?? 0} ovos</strong>
          </div>
        </section>

        <section className="fstd-summary-card">
          <h2>Fotos enviadas</h2>
          {storedPhotoPaths.length > 0
            ? <FstdStoredPhotos paths={storedPhotoPaths} />
            : <p className="fstd-summary-empty">Nenhuma foto enviada.</p>}
        </section>

        {canEdit && (
          <button className="fstd-summary-edit-button" onClick={onEdit} type="button">
            Editar informações
          </button>
        )}
        {!canEdit && <p className="fstd-summary-locked">Esta NFD já foi finalizada e não pode mais ser editada.</p>}
        {error && <strong className="promotor-error fstd-list-error">{error}</strong>}
      </div>
    </main>
  )
}

function FstdQuickProductForm({ product, motivos, busy, error, initialDraft = null, onSubmit, onOpenDetailed }) {
  const totalBilled = getProductBilledQuantity(product, 'galinha') + getProductBilledQuantity(product, 'codorna')
  const defaultDivision = initialDraft?.divisoes?.[0] ?? getFstdDivisionDefaults(product)[0] ?? { motivoId: '', retorno: '' }
  const [motivoId, setMotivoId] = useState(defaultDivision.motivoId ?? '')
  const [retorno, setRetorno] = useState(defaultDivision.retorno != null ? String(defaultDivision.retorno) : '')
  const [fotos, setFotos] = useState(() => (Array.isArray(initialDraft?.fotos) ? initialDraft.fotos : []))
  const [photoPreviews, setPhotoPreviews] = useState(() => (Array.isArray(initialDraft?.fotosPreviews) ? initialDraft.fotosPreviews : []))
  const normalizedReturn = normalizeNonNegativeQuantity(retorno)
  const hasPhotos = fotos.length > 0
  const returnIsTooHigh = String(retorno).trim() !== '' && normalizedReturn > totalBilled
  const canSubmit = Boolean(
    motivoId
      && totalBilled > 0
      && String(retorno).trim() !== ''
      && !returnIsTooHigh
      && hasPhotos
      && !busy,
  )

  function handleReturnChange(value) {
    if (value === '') {
      setRetorno('')
      return
    }

    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed)) return
    setRetorno(String(Math.min(Math.max(0, parsed), totalBilled)))
  }

  async function handlePhotoChange(files) {
    setFotos(files)
    setPhotoPreviews(await createFstdPhotoPreviews(files))
  }

  function removePhoto(indexToRemove) {
    setFotos((current) => current.filter((_, index) => index !== indexToRemove))
    setPhotoPreviews((current) => current.filter((_, index) => index !== indexToRemove))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return

    await onSubmit({
      product,
      divisoes: [{ motivoId, faturado: totalBilled, retorno: normalizedReturn }],
      observacao: null,
      fotos,
      fotosExistentes: [],
      faturadoGalinha: getProductBilledQuantity(product, 'galinha'),
      faturadoCodorna: getProductBilledQuantity(product, 'codorna'),
    })
  }

  return (
    <form className="fstd-quick-form" onSubmit={handleSubmit}>
      <div className="fstd-quick-form-header">
        <strong>Preenchimento</strong>
        <button className="fstd-quick-submit" disabled={!canSubmit} type="submit">
          {busy ? 'Enviando...' : 'Enviar'}
        </button>
      </div>

      <div className="fstd-quick-fields">
        <label className="mobile-field">
          <span>Motivo <small aria-label="Obrigatório" className="required-label">*</small></span>
          <AppSelect required searchable value={motivoId} onChange={(event) => setMotivoId(event.target.value)}>
            <option value="">Selecione</option>
            {motivos.filter((motivo) => motivo.ativo || motivo.id === motivoId).map((motivo) => (
              <option key={motivo.id} value={motivo.id}>{motivo.nome}</option>
            ))}
          </AppSelect>
        </label>

        <label className="mobile-field">
          <span>Faturado <small aria-label="Obrigatório" className="required-label">*</small></span>
          <div className="unit-input">
            <input aria-readonly="true" readOnly required type="number" value={totalBilled} />
            <em>ovos</em>
          </div>
        </label>

        <label className="mobile-field">
          <span>Retorno <small aria-label="Obrigatório" className="required-label">*</small></span>
          <div className="unit-input">
            <input
              inputMode="numeric"
              max={totalBilled}
              min="0"
              onChange={(event) => handleReturnChange(event.target.value)}
              required
              type="number"
              value={retorno}
            />
            <em>ovos</em>
          </div>
        </label>

        <button
          aria-label="Adicionar outro motivo"
          className="fstd-quick-add"
          onClick={() => onOpenDetailed({
            divisoes: [{ motivoId, faturado: totalBilled, retorno: String(retorno).trim() === '' ? '' : normalizedReturn }],
            fotos,
            fotosPreviews: photoPreviews,
            fotosExistentes: [],
            faturadoGalinha: getProductBilledQuantity(product, 'galinha'),
            faturadoCodorna: getProductBilledQuantity(product, 'codorna'),
            lotes: '',
          })}
          title="Adicionar outro motivo"
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      <label className="fstd-quick-photos">
        <span>Fotos <small aria-label="Obrigatório" className="required-label">*</small></span>
        <span className="photo-button">
          <input
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => { void handlePhotoChange(Array.from(event.target.files ?? [])) }}
            required={!hasPhotos}
            type="file"
          />
          <span className="fstd-quick-photo-content">
            <img src={cameraIcon} alt="" aria-hidden="true" />
            <span>Envio de imagens</span>
          </span>
        </span>
      </label>

      {photoPreviews.length > 0 && (
        <div className="fstd-photo-previews">
          {photoPreviews.map((preview, index) => (
            <div className="fstd-photo-preview" key={`${preview.file.name}-${index}`}>
              <img alt={`Pré-visualização de ${preview.file.name}`} src={preview.url} />
              <button aria-label={`Remover ${preview.file.name}`} onClick={() => removePhoto(index)} type="button">×</button>
            </div>
          ))}
        </div>
      )}

      {returnIsTooHigh && <strong className="fstd-quantity-error">A quantidade de retorno não pode passar do faturado.</strong>}
      {error && <strong className="promotor-error">{error}</strong>}
    </form>
  )
}

// These legacy components remain available for the detailed/editing flow and for
// compatibility with drafts created before the table layout was introduced.
const fstdLegacyComponentReferences = [FstdProductForm, FstdProductSummary, FstdQuickProductForm]
void fstdLegacyComponentReferences

function createFstdTableRow(product, division, index, fotosExistentes = []) {
  return {
    id: `${product.codigo_produto}-${index}`,
    isAdditional: index > 0,
    motivoId: division.motivoId ?? '',
    otherMotivoId: '',
    faturado: String(division.faturado ?? ''),
    initialFaturado: String(division.faturado ?? ''),
    retorno: String(division.retorno ?? ''),
    fotos: [],
    fotosPreviews: [],
    fotosExistentes: index === 0 ? fotosExistentes : [],
  }
}

function createFstdTableDraft(product) {
  const preserveSavedReturn = product.persisted?.status === 'concluido'
  const divisions = getFstdDivisionDefaults(product).map((division) => ({
    motivoId: division.motivoId,
    faturado: product.is_avulsa ? '' : division.faturado,
    retorno: preserveSavedReturn ? String(division.retorno ?? '') : '',
  }))

  return {
    rows: divisions.map((division, index) => createFstdTableRow(
      product,
      division,
      index,
      index === 0 ? getFstdStoredPhotoPaths(product) : [],
    )),
    faturadoGalinha: String(getProductBilledQuantity(product, 'galinha')),
    faturadoCodorna: String(getProductBilledQuantity(product, 'codorna')),
  }
}

function getFstdTableBilledSplit(product, total) {
  const originalGalinha = getProductBilledQuantity(product, 'galinha')
  const originalCodorna = getProductBilledQuantity(product, 'codorna')

  if (originalCodorna > 0 && originalGalinha === 0) {
    return { galinha: 0, codorna: total }
  }

  if (originalGalinha > 0 && originalCodorna === 0) {
    return { galinha: total, codorna: 0 }
  }

  return {
    galinha: Math.min(originalGalinha, total),
    codorna: Math.max(0, total - Math.min(originalGalinha, total)),
  }
}

export function FstdLegacyTotalsEditor({ legacy, billedGalinha = 0, billedCodorna = 0, busy, error, onSubmit }) {
  const [galinha, setGalinha] = useState(() => String(legacy?.qtd_retorno_galinha ?? 0))
  const [codorna, setCodorna] = useState(() => String(legacy?.qtd_retorno_codorna ?? 0))
  const [validationError, setValidationError] = useState('')

  function parseQuantity(value) {
    const normalized = String(value).trim()
    if (!/^\d+$/.test(normalized)) return null
    return Number(normalized)
  }

  function handleSubmit(event) {
    event.preventDefault()
    const retornoGalinha = parseQuantity(galinha)
    const retornoCodorna = parseQuantity(codorna)

    if (retornoGalinha === null || retornoCodorna === null) {
      setValidationError('Informe quantidades inteiras iguais ou maiores que zero.')
      return
    }

    if ((Number(billedGalinha) > 0 && retornoGalinha > Number(billedGalinha))
      || (Number(billedCodorna) > 0 && retornoCodorna > Number(billedCodorna))) {
      setValidationError('A quantidade de retorno não pode ser maior que a quantidade faturada.')
      return
    }

    setValidationError('')
    onSubmit({ legadoId: legacy.legado_id, retornoGalinha, retornoCodorna })
  }

  return (
    <form className="fstd-legacy-totals-editor" onSubmit={handleSubmit}>
      <section className="fstd-legacy-totals-intro">
        <h2>Retorno por tipo de ovo</h2>
        <p>Esta NFD não possui produtos detalhados. Por isso, a edição é feita somente pelos totais de Galinha e Codorna.</p>
      </section>
      <div className="fstd-legacy-totals-grid">
        <label>
          <span>Galinha</span>
          <small>Faturado: {Number(billedGalinha).toLocaleString('pt-BR')} ovos</small>
          <input aria-label="Retorno de Galinha" inputMode="numeric" min="0" onChange={(event) => setGalinha(event.target.value)} type="number" value={galinha} />
        </label>
        <label>
          <span>Codorna</span>
          <small>Faturado: {Number(billedCodorna).toLocaleString('pt-BR')} ovos</small>
          <input aria-label="Retorno de Codorna" inputMode="numeric" min="0" onChange={(event) => setCodorna(event.target.value)} type="number" value={codorna} />
        </label>
      </div>
      {(validationError || error) && <strong className="promotor-error">{validationError || error}</strong>}
      <footer className="fstd-legacy-totals-actions">
        <button disabled={busy} type="submit">{busy ? 'Salvando...' : 'Salvar alterações'}</button>
      </footer>
    </form>
  )
}

export function FstdTableEditor({ products, motivos, busy, processFinalized, allowFinalizedEdit, onAddProducts, onSubmit }) {
  const finalizationLocked = processFinalized && !allowFinalizedEdit
  const canEdit = !finalizationLocked
  const [drafts, setDrafts] = useState(() => Object.fromEntries(
    products.map((product) => [product.codigo_produto, createFstdTableDraft(product)]),
  ))
  const persistedObservation = products.find((product) => product.persisted?.observacao)?.persisted?.observacao ?? ''
  const [observation, setObservation] = useState(() => getEditableObservation(persistedObservation))
  const observationTouchedRef = useRef(false)
  const [globalPhotos, setGlobalPhotos] = useState([])

  useEffect(() => {
    if (observationTouchedRef.current) return
    setObservation(getEditableObservation(persistedObservation))
  }, [persistedObservation])

  function updateDraft(productCode, updater) {
    setDrafts((current) => ({
      ...current,
      [productCode]: updater(current[productCode]),
    }))
  }

  function updateRow(product, rowId, patch) {
    updateDraft(product.codigo_produto, (draft) => ({
      ...draft,
      rows: draft.rows.map((row) => row.id === rowId ? { ...row, ...patch } : row),
    }))
  }

  function updateFaturado(product, row, value) {
    if (product.is_avulsa) {
      updateRow(product, row.id, {
        faturado: value === '' ? '' : String(normalizeNonNegativeQuantity(value)),
      })
      return
    }

    const databaseBilled = getProductBilledQuantity(product, 'galinha') + getProductBilledQuantity(product, 'codorna')

    updateDraft(product.codigo_produto, (draft) => {
      const otherRowsBilled = draft.rows
        .filter((candidate) => candidate.id !== row.id)
        .reduce((total, candidate) => total + normalizeQuantity(candidate.faturado), 0)

      if (!row.isAdditional && value !== '' && normalizeQuantity(value) >= databaseBilled) {
        return {
          ...draft,
          rows: draft.rows
            .filter((candidate) => !candidate.isAdditional)
            .map((candidate) => candidate.id === row.id
              ? { ...candidate, faturado: String(databaseBilled), otherMotivoId: '' }
              : candidate),
        }
      }

      const remainingBilled = Math.max(0, databaseBilled - otherRowsBilled)
      const rowLimit = row.isAdditional
        ? remainingBilled
        : Math.min(normalizeQuantity(row.initialFaturado), remainingBilled)
      const nextValue = value === '' ? value : String(Math.min(normalizeQuantity(value), rowLimit))

      return {
        ...draft,
        rows: draft.rows.map((candidate) => candidate.id === row.id
          ? {
            ...candidate,
            faturado: nextValue,
            ...(candidate.isAdditional ? {} : { otherMotivoId: nextValue === candidate.initialFaturado ? '' : candidate.otherMotivoId }),
          }
          : candidate),
      }
    })
  }

  function getFaturadoLimit(product, row, rows) {
    if (product.is_avulsa) return undefined

    const databaseBilled = getProductBilledQuantity(product, 'galinha') + getProductBilledQuantity(product, 'codorna')
    const hasAdditionalRows = rows.some((candidate) => candidate.isAdditional)
    const otherRowsBilled = rows
      .filter((candidate) => candidate.id !== row.id)
      .reduce((total, candidate) => total + normalizeQuantity(candidate.faturado), 0)
    const remainingBilled = Math.max(0, databaseBilled - otherRowsBilled)

    if (!row.isAdditional && hasAdditionalRows) return databaseBilled

    return row.isAdditional
      ? remainingBilled
      : Math.min(normalizeQuantity(row.initialFaturado), remainingBilled)
  }

  function updateRetorno(product, row, value) {
    const faturado = normalizeQuantity(row.faturado)
    const nextValue = value === ''
      ? value
      : String(Math.min(normalizeNonNegativeQuantity(value), faturado))

    updateRow(product, row.id, { retorno: nextValue })
  }

  async function updateRowPhotos(product, rowId, files) {
    const previews = await createFstdPhotoPreviews(files)
    updateRow(product, rowId, { fotos: files, fotosPreviews: previews })
  }

  function addAdditionalRow(product) {
    updateDraft(product.codigo_produto, (draft) => ({
      ...draft,
      rows: [
        ...draft.rows,
        {
          ...createFstdTableRow(product, {
            motivoId: '',
            faturado: String(Math.max(
              0,
              getProductBilledQuantity(product, 'galinha')
                + getProductBilledQuantity(product, 'codorna')
                - draft.rows.reduce((total, row) => total + normalizeQuantity(row.faturado), 0),
            )),
            retorno: '',
            }, draft.rows.length),
          id: `${product.codigo_produto}-extra-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
        },
      ],
    }))
  }

  function removeAdditionalRow(product, rowId) {
    updateDraft(product.codigo_produto, (draft) => ({
      ...draft,
      rows: draft.rows.filter((row) => row.id !== rowId),
    }))
  }

  async function updateGlobalPhotos(files) {
    setGlobalPhotos(await createFstdPhotoPreviews(files))
  }

  function removeGlobalPhoto(indexToRemove) {
    setGlobalPhotos((current) => current.filter((_, index) => index !== indexToRemove))
  }

  function restoreChanges() {
    setDrafts(Object.fromEntries(
      products.map((product) => [product.codigo_produto, createFstdTableDraft(product)]),
    ))
    observationTouchedRef.current = false
    setObservation(getEditableObservation(persistedObservation))
    setGlobalPhotos([])
  }

  function removeRowPhoto(product, rowId, indexToRemove) {
    updateDraft(product.codigo_produto, (draft) => ({
      ...draft,
      rows: draft.rows.map((row) => row.id === rowId
        ? {
          ...row,
          fotos: row.fotos.filter((_, index) => index !== indexToRemove),
          fotosPreviews: row.fotosPreviews.filter((_, index) => index !== indexToRemove),
        }
        : row),
    }))
  }

  function removeStoredPhoto(product, pathToRemove) {
    updateDraft(product.codigo_produto, (draft) => ({
      ...draft,
      rows: draft.rows.map((row) => ({
        ...row,
        fotosExistentes: row.fotosExistentes.filter((path) => path !== pathToRemove),
      })),
    }))
  }

  function getRowMotivoId(row) {
    return row.otherMotivoId || row.motivoId
  }

  function isRowValid(row, rows) {
    const faturado = normalizeQuantity(row.faturado)
    const retorno = normalizeNonNegativeQuantity(row.retorno)
    const motivoIsUnique = rows.every((otherRow) => otherRow.id === row.id || getRowMotivoId(otherRow) !== getRowMotivoId(row))

    return Boolean(
      getRowMotivoId(row)
        && faturado > 0
        && String(row.retorno).trim() !== ''
        && retorno <= faturado
        && motivoIsUnique
    )
  }

  function getProductValidation(product) {
    const draft = drafts[product.codigo_produto]
    if (!draft) return false

    const rowsBilled = draft.rows.reduce((total, row) => total + normalizeQuantity(row.faturado), 0)
    const databaseBilled = getProductBilledQuantity(product, 'galinha') + getProductBilledQuantity(product, 'codorna')
    const productPhotosCount = draft.rows.reduce((total, row) => total + row.fotos.length + row.fotosExistentes.length, 0)
    const targetBilledIsValid = product.is_avulsa ? rowsBilled > 0 : rowsBilled === databaseBilled

    return Boolean(
      draft.rows.length > 0
        && draft.rows.every((row) => isRowValid(row, draft.rows))
        && targetBilledIsValid
        && productPhotosCount >= draft.rows.length,
    )
  }

  const canSubmit = Boolean(
    canEdit
      && !busy
      && products.length > 0
      && products.every((product) => getProductValidation(product)),
  )
  const storedPhotoCount = products.reduce((total, product) => {
    const draft = drafts[product.codigo_produto]
    return total + (draft?.rows ?? []).reduce((rowTotal, row) => rowTotal + row.fotosExistentes.length, 0)
  }, 0)
  const photoCount = storedPhotoCount + products.reduce((total, product) => {
    const draft = drafts[product.codigo_produto]
    return total + (draft?.rows ?? []).reduce((rowTotal, row) => rowTotal + row.fotos.length, 0)
  }, 0)
  const totalFaturado = products.reduce((total, product) => {
    const draft = drafts[product.codigo_produto]
    return total + (draft?.rows ?? []).reduce((rowTotal, row) => rowTotal + normalizeQuantity(row.faturado), 0)
  }, 0)
  const totalRetorno = products.reduce((total, product) => {
    const draft = drafts[product.codigo_produto]
    return total + (draft?.rows ?? []).reduce((rowTotal, row) => rowTotal + normalizeNonNegativeQuantity(row.retorno), 0)
  }, 0)
  const hasAdditionalRows = products.some((product) => (drafts[product.codigo_produto]?.rows ?? []).some((row) => row.isAdditional))
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return

    const payloads = products.map((product) => {
      const draft = drafts[product.codigo_produto]
      const totalBilled = draft.rows.reduce((total, row) => total + normalizeQuantity(row.faturado), 0)
      const billedSplit = product.is_avulsa || product.persisted?.status === 'concluido'
        ? getFstdTableBilledSplit(product, totalBilled)
        : {
          galinha: getProductBilledQuantity(product, 'galinha'),
          codorna: getProductBilledQuantity(product, 'codorna'),
        }
      const rowPhotos = draft.rows.flatMap((row) => row.fotos)
      const existingPhotos = [...new Set(draft.rows.flatMap((row) => row.fotosExistentes))]

      return {
        product,
        divisoes: draft.rows.map((row) => ({
          motivoId: getRowMotivoId(row),
          faturado: normalizeQuantity(row.faturado),
          retorno: normalizeNonNegativeQuantity(row.retorno),
        })),
        observacao: observation.trim() || null,
        fotos: rowPhotos,
        fotosExistentes: existingPhotos,
        faturadoGalinha: billedSplit.galinha,
        faturadoCodorna: billedSplit.codorna,
      }
    })

    await onSubmit(payloads)
  }

  function renderMotivoOptions(row, rows) {
    const selectedIds = rows
      .filter((otherRow) => otherRow.id !== row.id)
      .map((otherRow) => getRowMotivoId(otherRow))
      .filter(Boolean)

    return motivos
      .filter((motivo) => motivo.ativo || motivo.id === row.motivoId || motivo.id === row.otherMotivoId)
      .map((motivo) => (
        <option disabled={selectedIds.includes(motivo.id)} key={motivo.id} value={motivo.id}>
          {motivo.nome}
        </option>
      ))
  }

  return (
    <form className="fstd-table-form" onSubmit={handleSubmit}>
      <div className="fstd-table-scroll">
        <table className={`fstd-product-table${hasAdditionalRows ? ' has-other-motivo' : ''}`}>
          <thead>
            <tr>
              <th scope="col">Produto <b aria-hidden="true" className="fstd-required-mark">*</b></th>
              <th scope="col">Motivo <b aria-hidden="true" className="fstd-required-mark">*</b></th>
              <th scope="col"><span>Fat <b aria-hidden="true" className="fstd-required-mark">*</b></span><small>(Faturado)</small></th>
              <th scope="col"><span>Ret <b aria-hidden="true" className="fstd-required-mark">*</b></span><small>(Retorno)</small></th>
              <th scope="col">Foto <b aria-hidden="true" className="fstd-required-mark">*</b></th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td className="fstd-table-empty" colSpan="5">Esta NFD não possui produtos detalhados para realizar a FSTD.</td>
              </tr>
            )}
            {products.flatMap((product) => {
              const draft = drafts[product.codigo_produto] ?? createFstdTableDraft(product)
              const productCompleted = product.persisted?.status === 'concluido'
              const rowsBilled = draft.rows.reduce((total, row) => total + normalizeQuantity(row.faturado), 0)
              const databaseBilled = getProductBilledQuantity(product, 'galinha') + getProductBilledQuantity(product, 'codorna')
              const billedMatchesDatabase = product.is_avulsa ? rowsBilled > 0 : rowsBilled === databaseBilled
              const productHasRequiredPhotos = draft.rows.reduce((total, row) => total + row.fotos.length + row.fotosExistentes.length, 0) >= draft.rows.length
              return draft.rows.map((row) => {
                const rowCompleted = isRowValid(row, draft.rows) && billedMatchesDatabase && productHasRequiredPhotos
                const billedWasReduced = !row.isAdditional
                  && normalizeQuantity(row.faturado) < normalizeQuantity(row.initialFaturado)
                const canAddAdditional = (row.isAdditional || billedWasReduced) && rowsBilled < databaseBilled
                const rowDisabled = !canEdit || (processFinalized && !productCompleted)
                const rowHasPhoto = row.fotos.length > 0 || row.fotosExistentes.length > 0
                return (
                  <tr className={`${row.isAdditional ? 'is-additional ' : ''}${rowCompleted ? 'is-complete' : 'is-pending'}`} key={row.id}>
                    <th className="fstd-table-product" scope="row">
                      <span>
                        <strong>{product.nome}</strong>
                        {product.codigo_produto && <small>Cód. do produto<br />{product.codigo_produto}</small>}
                      </span>
                    </th>
                    <td className="fstd-spreadsheet-cell fstd-motivo-spreadsheet-cell">
                      <div className="fstd-motivo-cell">
                        <AppSelect
                          aria-label={`Motivo de ${product.nome}`}
                          disabled={rowDisabled}
                          required
                          searchable
                          value={row.motivoId}
                          onChange={(event) => updateRow(product, row.id, { motivoId: event.target.value })}
                        >
                          <option value="">Selecione</option>
                          {renderMotivoOptions(row, draft.rows)}
                        </AppSelect>
                        {(row.isAdditional || canAddAdditional) && <div className="fstd-motivo-actions">
                          <button
                          aria-label={row.isAdditional
                            ? `Remover motivo adicional de ${product.nome}`
                            : `Adicionar outro motivo para ${product.nome}`}
                          className="fstd-table-add-button"
                          disabled={rowDisabled}
                          onClick={() => row.isAdditional
                            ? removeAdditionalRow(product, row.id)
                            : addAdditionalRow(product)}
                          type="button"
                        >
                          {row.isAdditional ? '−' : '+'}
                          </button>
                          {row.isAdditional && canAddAdditional && <button
                          aria-label={`Adicionar outro motivo para ${product.nome}`}
                          className="fstd-table-add-button"
                          disabled={rowDisabled}
                          onClick={() => addAdditionalRow(product)}
                          type="button"
                        >
                          +
                          </button>}
                        </div>}
                      </div>
                    </td>
                    <td className="fstd-spreadsheet-cell fstd-number-spreadsheet-cell">
                      <input
                        aria-label={`Faturado de ${product.nome}`}
                        disabled={rowDisabled}
                        inputMode="numeric"
                        max={getFaturadoLimit(product, row, draft.rows)}
                        min="1"
                        required
                        type="number"
                        value={row.faturado}
                        onChange={(event) => updateFaturado(product, row, event.target.value)}
                      />
                    </td>
                    <td className="fstd-spreadsheet-cell fstd-number-spreadsheet-cell">
                      <input
                        aria-label={`Retorno de ${product.nome}`}
                        disabled={rowDisabled}
                        inputMode="numeric"
                        max={Math.max(0, normalizeQuantity(row.faturado))}
                        min="0"
                        required
                        type="number"
                        value={row.retorno}
                        onChange={(event) => updateRetorno(product, row, event.target.value)}
                      />
                    </td>
                    <td className={`fstd-spreadsheet-cell fstd-photo-spreadsheet-cell${rowHasPhoto ? ' has-photo' : ''}`}>
                      <label className="fstd-table-camera fstd-spreadsheet-camera" title={`Adicionar foto de ${product.nome}`}>
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          disabled={rowDisabled}
                          multiple
                          onChange={(event) => { void updateRowPhotos(product, row.id, Array.from(event.target.files ?? [])) }}
                          type="file"
                        />
                        <img src={cameraIcon} alt="" aria-hidden="true" />
                        {rowHasPhoto && <span aria-label="Foto adicionada" className="fstd-photo-cell-check">✓</span>}
                      </label>
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
          <tfoot>
            <tr className="fstd-table-total-row">
              <th colSpan="2" scope="row">Total</th>
              <td>{totalFaturado}</td>
              <td>{totalRetorno}</td>
              <td aria-label="Total de fotos">{photoCount}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {products.some((product) => product.is_avulsa) && !processFinalized && (
        <div className="fstd-avulsa-actions fstd-avulsa-actions-after-total">
          <button className="fstd-add-products-button" onClick={onAddProducts} type="button">
            + Adicionar mais produtos
          </button>
        </div>
      )}

      <section className="fstd-table-section fstd-observation-section">
        <label htmlFor="fstd-general-observation">
          Observação Geral <small className="fstd-optional-label">Não obrigatório</small>
        </label>
        <div className="fstd-observation-field">
          <textarea
            id="fstd-general-observation"
            disabled={!canEdit}
            maxLength="500"
            placeholder="Digite suas observações aqui..."
            value={observation}
            onChange={(event) => {
              observationTouchedRef.current = true
              setObservation(event.target.value)
            }}
            rows="4"
          />
          <span>{observation.length}/500</span>
        </div>
      </section>

      <section className="fstd-table-section fstd-sent-photos-section">
          <h2>Fotos Enviadas ({photoCount})</h2>
          <div className="fstd-sent-photos">
            {photoCount === 0 && (
              <div className="fstd-empty-photos" role="status">
                <img src={cameraIcon} alt="" aria-hidden="true" />
                <span>Nenhuma foto enviada</span>
              </div>
            )}
            {products.map((product) => {
            const storedPaths = (drafts[product.codigo_produto]?.rows ?? []).flatMap((row) => row.fotosExistentes)
            if (storedPaths.length === 0) return null
            return (
              <FstdStoredPhotos
                key={`stored-${product.codigo_produto}`}
                paths={[...new Set(storedPaths)]}
                onRemove={(path) => removeStoredPhoto(product, path)}
                removable={canEdit}
                associationLabel={`Produto: ${product.nome}`}
              />
            )
          })}
          {products.flatMap((product) => (drafts[product.codigo_produto]?.rows ?? []).flatMap((row) => (
            row.fotosPreviews.map((preview, index) => ({ product, row, preview, index }))
          ))).map(({ product, row, preview, index }) => (
            <div
              className="fstd-photo-preview"
              key={`${product.codigo_produto}-${row.id}-${preview.file.name}-${index}`}
              onClick={(event) => {
                if (event.target.closest('button')) return
                setSelectedPhoto({
                associationLabel: `Produto: ${product.nome}`,
                url: preview.url,
                })
              }}
            >
              <img alt={`Pré-visualização de ${preview.file.name}`} src={preview.url} />
              <button aria-label={`Remover ${preview.file.name}`} onClick={() => removeRowPhoto(product, row.id, index)} type="button">×</button>
            </div>
          ))}
          {globalPhotos.map((preview, index) => (
            <div
              className="fstd-photo-preview"
              key={`global-${preview.file.name}-${index}`}
              onClick={(event) => {
                if (event.target.closest('button')) return
                setSelectedPhoto({
                associationLabel: 'Foto geral da NFD',
                url: preview.url,
                })
              }}
            >
              <img alt={`Pré-visualização de ${preview.file.name}`} src={preview.url} />
              <button aria-label={`Remover ${preview.file.name}`} onClick={() => removeGlobalPhoto(index)} type="button">×</button>
            </div>
          ))}
          <label className="fstd-add-photo-tile">
            <input
              accept="image/jpeg,image/png,image/webp"
              disabled={!canEdit}
              multiple
              onChange={(event) => { void updateGlobalPhotos(Array.from(event.target.files ?? [])) }}
              type="file"
            />
            <img src={cameraIcon} alt="" aria-hidden="true" />
            <span>Adicionar foto</span>
          </label>
        </div>
      </section>

      {!finalizationLocked && (
        <button
        aria-disabled={finalizationLocked}
        className="fstd-send-button"
        disabled={!canSubmit || finalizationLocked}
        tabIndex={finalizationLocked ? -1 : undefined}
        type="submit"
      >
        <span aria-hidden="true">⌁</span>
        {busy ? 'Salvando...' : 'Finalizar'}
        </button>
      )}
      {!finalizationLocked && (
        <footer className="fstd-desktop-actions">
          <button type="button" onClick={restoreChanges}>Restaurar alterações</button>
          <button disabled={!canSubmit} type="submit">
            {busy ? 'Salvando...' : allowFinalizedEdit ? 'Salvar alterações' : 'Finalizar'}
          </button>
        </footer>
      )}
      <FstdPhotoLightbox photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
    </form>
  )
}

function FstdScreen({ store, nfd, motivos, process, busy, error, finalizeBusy, legacyTotals, legacyTotalsBusy, legacyTotalsError, onSaveLegacyTotals, onBack, onClose, hideBack = false, allowFinalizedEdit = false, onSubmitProduct, onAddProducts, onFinalize }) {
  const processProducts = process?.produtos ?? []
  const persistedByKey = new Map(processProducts.map((product) => [getProductGroupKey(product), product]))
  const products = (nfd?.produtos ?? []).map((product) => ({
    ...product,
    persisted: persistedByKey.get(getProductGroupKey(product)),
    is_avulsa: Boolean(nfd?.is_avulsa),
  }))
  const processFinalized = process?.status === 'concluida'
  const isAvulsa = Boolean(nfd?.is_avulsa)

  async function handleSubmitProducts(payloads) {
    for (const payload of payloads) {
      await onSubmitProduct(payload)
    }
    await onFinalize()
  }

  return (
    <>
      <main className={`promotor-app fstd-app fstd-list-page${isAvulsa ? ' is-avulsa' : ''}`}>
        <header className="fstd-list-topbar">
          {hideBack
            ? <button className="fstd-back-button" type="button" onClick={onClose} aria-label="Voltar"><span aria-hidden="true">‹</span><em>Voltar</em></button>
            : <button className="fstd-back-button" type="button" onClick={onBack} aria-label="Voltar"><span aria-hidden="true">‹</span><em>Voltar</em></button>}
          <strong>{hideBack ? allowFinalizedEdit ? 'Editar NFD' : 'Preencher NFD' : 'FSTD'}</strong>
          <span />
        </header>

        <section className="fstd-list-hero">
          <img src={avineLogo} alt="Avine" />
          <div>
            <h1>{getStoreTitle(store)}</h1>
            <p>NFD: {getNfdNumber(nfd)} / CÓD: {getStoreCode(store, nfd)}</p>
          </div>
        </section>

        {products.length === 0 && legacyTotalsBusy && <p className="fstd-summary-empty">Carregando totais da FSTD...</p>}
        {products.length === 0 && !legacyTotalsBusy && legacyTotals && (
          <FstdLegacyTotalsEditor
            key={legacyTotals.legado_id}
            billedCodorna={Number(nfd?.quantidade_codorna ?? legacyTotals.qtd_total_codorna ?? 0)}
            billedGalinha={Number(nfd?.quantidade_galinha ?? legacyTotals.qtd_total_galinha ?? 0)}
            busy={busy}
            error={legacyTotalsError || error}
            legacy={legacyTotals}
            onSubmit={onSaveLegacyTotals}
          />
        )}
        {!(products.length === 0 && (legacyTotalsBusy || legacyTotals)) && (
          <FstdTableEditor
            key={products.map((product) => product.codigo_produto).join('|')}
            allowFinalizedEdit={allowFinalizedEdit}
            busy={busy || finalizeBusy}
            motivos={motivos}
            onAddProducts={onAddProducts}
            onSubmit={handleSubmitProducts}
            processFinalized={processFinalized}
            products={products}
          />
        )}

        {error && <strong className="promotor-error fstd-list-error">{error}</strong>}
      </main>
    </>
  )
}

function GerencialFinalizedNfdScreen({ store, nfd, onClose, onEdit, onViewDocument, documentBusy, documentError }) {
  const [document, setDocument] = useState(null)
  const [documentLoadError, setDocumentLoadError] = useState('')
  const [invoiceCopied, setInvoiceCopied] = useState(false)
  const nfdRef = useRef(nfd)
  const nfdProcessId = nfd?.fstd_process_id

  useEffect(() => {
    nfdRef.current = nfd
  }, [nfd])

  useEffect(() => {
    let active = true
    void onViewDocument(nfdRef.current)
      .then((result) => {
        if (active) {
          setDocumentLoadError('')
          setDocument(result)
        }
      })
      .catch((error) => {
        if (active) {
          setDocumentLoadError(error?.message || 'PDF FSTD indisponível.')
        }
      })

    return () => {
      active = false
    }
  }, [nfdProcessId, onViewDocument])

  const products = nfd?.fstd_process?.produtos ?? []
  const billedGalinha = Number(nfd?.quantidade_galinha ?? 0)
  const billedCodorna = Number(nfd?.quantidade_codorna ?? 0)
  const returnedTotal = nfd?.fstd_legado
    ? Number(nfd.fstd_legado.qtd_retorno_galinha ?? 0) + Number(nfd.fstd_legado.qtd_retorno_codorna ?? 0)
    : products.reduce((total, product) => total + Number(product.quantidade_retorno ?? 0), 0)
  const title = `${getStoreCode(store, nfd)} - ${getNfdNumber(nfd)}`
  const error = documentLoadError || documentError
  const photoProducts = products.filter((product) => Array.isArray(product.fotos) && product.fotos.length > 0)

  async function handleOpenInvoice() {
    window.open('https://meudanfe.com.br/#', '_blank', 'noopener,noreferrer')

    const accessKey = String(nfd?.chave_acesso ?? '').trim()
    if (!accessKey) return

    try {
      await navigator.clipboard.writeText(accessKey)
      setInvoiceCopied(true)
    } catch {
      setInvoiceCopied(false)
    }
  }

  return (
    <main className="gerencial-finalized-page">
      <header className="gerencial-finalized-titlebar">
        <strong>{title}</strong>
        <button type="button" onClick={onClose} aria-label="Fechar NFD finalizada">×</button>
      </header>

      <section className="gerencial-finalized-summary">
        <button
          className="gerencial-finalized-summary-item is-invoice"
          type="button"
          onClick={handleOpenInvoice}
          aria-label="Abrir DANFE e copiar a chave de acesso"
        >
          <InvoiceIcon status="sent" />
          <span>
            <strong>NFD</strong>
            <small>Finaliza em: {formatDate(nfd?.fstd_legado?.data_preenchimento ?? nfd?.fstd_process?.finalizada_em)}</small>
          </span>
        </button>
        <button
          className="gerencial-finalized-summary-item is-editable"
          type="button"
          onClick={() => onEdit?.(nfd, store)}
          aria-label="Editar FSTD finalizada"
        >
          <InvoiceIcon status="sent" />
          <span>
            <strong>FSTD</strong>
            <small>Finalizada em {formatDate(nfd?.fstd_legado?.data_preenchimento ?? nfd?.fstd_process?.finalizada_em)}</small>
          </span>
          <span className="gerencial-finalized-edit-hint">Editar</span>
        </button>
      </section>

      <section className="gerencial-finalized-body">
        <div className="gerencial-finalized-facts">
          <div className="gerencial-finalized-backlink">{title}</div>
          <h2>Faturado</h2>
          <dl>
            <div><dt>Galinha</dt><dd>{billedGalinha.toLocaleString('pt-BR')} ovos</dd></div>
            <div><dt>Codorna</dt><dd>{billedCodorna.toLocaleString('pt-BR')} ovos</dd></div>
          </dl>
          <h2>Retorno</h2>
          <dl>
            <div><dt>Total</dt><dd>{returnedTotal.toLocaleString('pt-BR')} ovos</dd></div>
          </dl>
          <section className="gerencial-finalized-photos">
            <h2>Fotos</h2>
            {photoProducts.length === 0 ? <p>Nenhuma foto enviada.</p> : photoProducts.map((product) => (
              <FstdStoredPhotos
                key={product.id ?? product.codigo_produto}
                paths={[...new Set(product.fotos)]}
                associationLabel={`Produto: ${product.nome}`}
              />
            ))}
          </section>
          {invoiceCopied && <p className="gerencial-finalized-copy-feedback" role="status">Chave de acesso copiada.</p>}
        </div>

        <div className="gerencial-finalized-pdf">
          <div className="gerencial-finalized-pdf-toolbar">
            <strong>PDF FSTD</strong>
            {document?.url && (
              <a href={document.url} download={`FSTD-${document.controlNumber}.pdf`} rel="noreferrer" target="_blank">
                Download
              </a>
            )}
          </div>
          {documentBusy && <p>Gerando PDF...</p>}
          {!documentBusy && document?.url && (
            <iframe src={document.url} title={`PDF FSTD ${document.controlNumber}`} />
          )}
          {!documentBusy && !document?.url && !error && <p>PDF indisponível.</p>}
          {error && <strong className="promotor-error">{error}</strong>}
        </div>
      </section>
    </main>
  )
}

const emptyNavigation = () => null
const ignoreNavigation = () => {}

export function PromotorWorkspace({
  profile,
  onLogout,
  navigation = {},
  embeddedFstd = false,
  embeddedFinalized = false,
  allowFinalizedEdit = false,
  initialStore = null,
  initialFstdTarget,
  onEmbeddedClose,
  onEmbeddedComplete,
  onEmbeddedEdit,
}) {
  const readNavigation = navigation.read ?? emptyNavigation
  const saveNavigation = navigation.save ?? ignoreNavigation
  const openInvoice = navigation.openInvoice ?? ignoreNavigation
  const queryClient = useQueryClient()
  const [savedNavigation] = useState(() => embeddedFstd || embeddedFinalized ? null : readNavigation(profile.id))
  const [selectedStore, setSelectedStore] = useState(() => initialStore ?? savedNavigation?.selectedStore ?? null)
  const [selectedNfd, setSelectedNfd] = useState(() => embeddedFstd || embeddedFinalized ? null : savedNavigation?.selectedNfd ?? null)
  const [fstdTarget, setFstdTarget] = useState(() => embeddedFstd || embeddedFinalized ? initialFstdTarget : savedNavigation?.fstdTarget)
  const [isAvulsaOpen, setAvulsaOpen] = useState(false)
  const [avulsaAddProductsTarget, setAvulsaAddProductsTarget] = useState(null)
  const [conferenceAlertDismissed, setConferenceAlertDismissed] = useState(false)
  const [storeSearch, setStoreSearch] = useState(() => savedNavigation?.storeSearch ?? '')
  const [nfdSearch, setNfdSearch] = useState(() => savedNavigation?.nfdSearch ?? '')
  const [statusFilter, setStatusFilter] = useState(() => savedNavigation?.statusFilter ?? 'atrasada')
  const [unknownNfdComments, setUnknownNfdComments] = useState(() => readUnknownNfdComments(profile.id))
  const [isProfilePageOpen, setProfilePageOpen] = useState(false)
  const [isProfileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profilePhoto, setProfilePhoto] = useState('')

  useEffect(() => {
    let active = true

    if (!profile?.foto_url) {
      return () => {
        active = false
      }
    }

    getProfilePhotoSignedUrl(profile.foto_url)
      .then((url) => {
        if (active) setProfilePhoto(url)
      })
      .catch(() => {
        if (active) setProfilePhoto('')
      })

    return () => {
      active = false
    }
  }, [profile?.foto_url])

  useEffect(() => {
    if (embeddedFstd || embeddedFinalized) return

    saveNavigation(profile.id, {
      selectedStore,
      selectedNfd,
      fstdTarget,
      storeSearch,
      nfdSearch,
      statusFilter,
    })
  }, [embeddedFinalized, embeddedFstd, fstdTarget, nfdSearch, profile.id, saveNavigation, selectedNfd, selectedStore, statusFilter, storeSearch])

  const workspaceQueries = usePromotorWorkspace(profile, {
    fstdAccessKey: embeddedFstd || embeddedFinalized ? initialFstdTarget?.chave_acesso : null,
  })
  const storesQuery = workspaceQueries.stores
  const nfdsQuery = workspaceQueries.invoices
  const produtosCatalogQuery = workspaceQueries.catalog
  const fstdProcessosQuery = workspaceQueries.processes
  const desconhecimentosQuery = workspaceQueries.unknown
  const motivosQuery = workspaceQueries.reasons

  const stores = useMemo(() => storesQuery.data ?? [], [storesQuery.data])
  const databaseUnknownNfdComments = useMemo(() => {
    const comments = {}

    for (const item of desconhecimentosQuery.data ?? []) {
      if (!comments[item.nfd_referencia]) comments[item.nfd_referencia] = item.comentario
    }

    return comments
  }, [desconhecimentosQuery.data])
  const allUnknownNfdComments = useMemo(
    () => ({ ...unknownNfdComments, ...databaseUnknownNfdComments }),
    [databaseUnknownNfdComments, unknownNfdComments],
  )
  const fstdProcessosByNfd = useMemo(
    () => {
      const processesByKey = new Map()

      for (const processo of fstdProcessosQuery.data ?? []) {
        processesByKey.set(String(processo.nfd_chave_acesso), processo)
        if (processo.is_avulsa) {
          processesByKey.set(getManualNfdKey(processo.loja_id, processo.nfd_numero), processo)
        }
      }

      return processesByKey
    },
    [fstdProcessosQuery.data],
  )
  const nfds = useMemo(
    () => {
      const importedNfds = (nfdsQuery.data ?? []).map((nfd) => {
        const processo = fstdProcessosByNfd.get(String(nfd.chave_acesso))
          ?? fstdProcessosByNfd.get(getManualNfdKey(nfd.loja_id, nfd.numero))
        const isAvulsa = Boolean(processo?.is_avulsa)
        const visualStatus = nfd.fstd_legado
          ? 'sent'
          : isAvulsa
          ? getNfdVisualStatus({
            is_avulsa: true,
            fstd_process_status: processo?.status,
            conferencia_status: processo?.conferencia_status,
          })
          : processo?.status === 'concluida'
            ? 'sent'
            : getNfdVisualStatus(nfd, allUnknownNfdComments)
        const importedProducts = getNfdProducts(nfd, produtosCatalogQuery.data ?? [])

        return {
          ...nfd,
          is_avulsa: isAvulsa,
          produtos: mergeNfdProducts(importedProducts, processo?.produtos),
          fstd_process_id: processo?.id ?? null,
          fstd_process_status: processo?.status ?? null,
          conferencia_status: processo?.conferencia_status ?? 'pendente',
          conferencia_detalhes: processo?.conferencia_detalhes ?? {},
          conferencia_em: processo?.conferencia_em ?? null,
          api_nfd_chave_acesso: processo?.api_nfd_chave_acesso ?? null,
          fstd_process: processo ?? null,
          visual_status: visualStatus,
          status_nfd: visualStatus === 'sent'
            ? 'finalizada'
            : isAvulsa
              ? 'avulsa'
            : nfd.fstd_legado
              ? 'finalizada'
              : getNfdTabStatus(nfd, allUnknownNfdComments),
        }
      })
      const importedManualKeys = new Set(
        importedNfds.map((nfd) => getManualNfdKey(nfd.loja_id, nfd.numero)),
      )
      const manualNfds = (fstdProcessosQuery.data ?? [])
        .filter((processo) => processo.is_avulsa && !importedManualKeys.has(getManualNfdKey(processo.loja_id, processo.nfd_numero)))
        .map((processo) => {
          const store = stores.find((item) => item.id === processo.loja_id)
          const products = mergeNfdProducts([], processo.produtos)
          const billedGalinha = products.reduce((total, product) => total + Number(product.quantidade_faturada_galinha ?? 0), 0)
          const billedCodorna = products.reduce((total, product) => total + Number(product.quantidade_faturada_codorna ?? 0), 0)
          const visualStatus = getNfdVisualStatus({
            is_avulsa: true,
            fstd_process_status: processo.status,
            conferencia_status: processo.conferencia_status,
          })

          return {
            id: processo.nfd_chave_acesso,
            chave_acesso: processo.nfd_chave_acesso,
            nota_fiscal: processo.nfd_numero,
            numero: processo.nfd_numero,
            data_emissao: processo.nfd_data_emissao,
            codigo_cliente: store?.codigo ?? null,
            loja_id: processo.loja_id,
            loja_codigo: store?.codigo ?? null,
            loja_nome: store?.nome ?? null,
            nome_abreviado: store?.nome ?? null,
            valor_total: processo.nfd_valor,
            quantidade_galinha: billedGalinha,
            quantidade_codorna: billedCodorna,
            produtos: products,
            is_avulsa: true,
            fstd_process_id: processo.id,
            fstd_process_status: processo.status,
            conferencia_status: processo.conferencia_status ?? 'pendente',
            conferencia_detalhes: processo.conferencia_detalhes ?? {},
            conferencia_em: processo.conferencia_em ?? null,
            api_nfd_chave_acesso: processo.api_nfd_chave_acesso ?? null,
            fstd_process: processo,
            visual_status: visualStatus,
            status_nfd: visualStatus === 'sent' ? 'finalizada' : 'avulsa',
          }
        })

      return [...importedNfds, ...manualNfds]
    },
    [allUnknownNfdComments, fstdProcessosByNfd, fstdProcessosQuery.data, nfdsQuery.data, produtosCatalogQuery.data, stores],
  )
  const selectedStoreNfds = selectedStore ? nfds.filter((nfd) => nfd.loja_id === selectedStore.id) : []
  const fallbackFstdProcess = fstdTarget
    ? fstdProcessosByNfd.get(String(fstdTarget.chave_acesso))
      ?? fstdTarget.fstd_process
      ?? null
    : null
  const currentFstdTarget = fstdTarget
    ? nfds.find((nfd) => String(nfd.chave_acesso) === String(fstdTarget.chave_acesso))
      ?? {
        ...fstdTarget,
        produtos: getFstdTargetProducts(
          fstdTarget,
          produtosCatalogQuery.data ?? [],
          fallbackFstdProcess?.produtos ?? fstdTarget.produtos ?? [],
        ),
        fstd_process_id: fallbackFstdProcess?.id ?? fstdTarget.fstd_process_id ?? null,
        fstd_process_status: fallbackFstdProcess?.status ?? fstdTarget.fstd_process_status ?? null,
        fstd_process: fallbackFstdProcess,
      }
    : undefined

  const hasNoDetailedProducts = Boolean(
    allowFinalizedEdit
    && currentFstdTarget
    && (currentFstdTarget.produtos ?? []).length === 0,
  )
  const legacyTotalsQuery = useQuery({
    enabled: hasNoDetailedProducts && Boolean(selectedStore?.codigo),
    queryKey: ['fstd-legacy-totals', selectedStore?.codigo, currentFstdTarget?.nota_fiscal ?? currentFstdTarget?.numero],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('obter_fstd_legado', legacyFstdLookupParams(currentFstdTarget, selectedStore))
      if (error) throw error
      return Array.isArray(data) ? data[0] ?? null : data
    },
  })

  const conferenceAlertNfd = conferenceAlertDismissed
    ? null
    : nfds.find((nfd) => nfd.is_avulsa && nfd.conferencia_status === 'divergente')
  const conferenceAlert = (
    <NfdConferenceErrorPopup
      nfd={conferenceAlertNfd}
      onClose={() => setConferenceAlertDismissed(true)}
    />
  )

  const avulsaMutation = useMutation({
    mutationFn: async ({ numero, valor, dataEmissao, produtos }) => {
      const { data: processoId, error: processoError } = await supabase.rpc('iniciar_fstd_avulsa', {
        p_loja_id: selectedStore.id,
        p_nfd_numero: numero.trim(),
        p_nfd_valor: Number(valor),
        p_nfd_data_emissao: dataEmissao,
        p_produtos: produtos.map((product) => ({ codigo_produto: product.codigo_produto })),
      })
      if (processoError) throw processoError

      const { data: processo, error: processoReadError } = await supabase
        .from('fstd_processos')
        .select('id, nfd_chave_acesso, nfd_numero, loja_id, is_avulsa, nfd_data_emissao, nfd_valor, conferencia_status, conferencia_detalhes, conferencia_em, api_nfd_chave_acesso, status, finalizada_em')
        .eq('id', processoId)
        .single()
      if (processoReadError) throw processoReadError

      const { data: produtosSalvos, error: produtosReadError } = await supabase
        .from('fstd_produtos')
        .select('id, processo_id, produto_id, codigo_produto, nome, descricao, imagem_url, quantidade_faturada_galinha, quantidade_faturada_codorna, quantidade_retorno, motivo_id, observacao, fotos, status, concluido_em')
        .eq('processo_id', processoId)
      if (produtosReadError) throw produtosReadError

      return {
        id: processo.nfd_chave_acesso,
        chave_acesso: processo.nfd_chave_acesso,
        nota_fiscal: processo.nfd_numero,
        numero: processo.nfd_numero,
        data_emissao: processo.nfd_data_emissao,
        codigo_cliente: selectedStore.codigo,
        loja_id: selectedStore.id,
        loja_codigo: selectedStore.codigo,
        loja_nome: selectedStore.nome,
        nome_abreviado: selectedStore.nome,
        valor_total: processo.nfd_valor,
        quantidade_galinha: 0,
        quantidade_codorna: 0,
        produtos: produtosSalvos ?? [],
        is_avulsa: true,
        fstd_process_id: processo.id,
        fstd_process_status: processo.status,
        conferencia_status: processo.conferencia_status,
        conferencia_detalhes: processo.conferencia_detalhes,
        conferencia_em: processo.conferencia_em,
        api_nfd_chave_acesso: processo.api_nfd_chave_acesso,
        fstd_process: { ...processo, produtos: produtosSalvos ?? [] },
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['fstd-process', { profileId: profile.id }] })
      await queryClient.invalidateQueries({ queryKey: ['invoices', { profileId: profile.id }] })
    },
  })

  const legacyTotalsMutation = useMutation({
    mutationFn: async ({ legadoId, retornoGalinha, retornoCodorna }) => {
      const { data, error } = await supabase.rpc('ajustar_fstd_legado_totais', {
        p_legado_id: legadoId,
        p_qtd_retorno_galinha: retornoGalinha,
        p_qtd_retorno_codorna: retornoCodorna,
      })
      if (error) throw error
      return Array.isArray(data) ? data[0] ?? data : data
    },
    onSuccess: async (legacy) => {
      await legacyTotalsQuery.refetch()
      if (embeddedFstd) {
        onEmbeddedComplete?.({ kind: 'legacy-totals-saved', legacy })
      }
    },
  })

  const fstdProductMutation = useMutation({
    mutationFn: async ({ product, divisoes, observacao, fotos = [], fotosExistentes = [], faturadoGalinha, faturadoCodorna }) => {
      let processoId = currentFstdTarget?.fstd_process_id ?? currentFstdTarget?.fstd_process?.id

      if (!processoId) {
        const { data, error } = await supabase.rpc('iniciar_fstd_produtos_v2', {
          p_loja_id: selectedStore.id,
          p_nfd_chave_acesso: String(currentFstdTarget.chave_acesso),
        })
        if (error) throw error
        processoId = data
      }

      let produtoId = product.persisted?.id
      if (!produtoId) {
        const { data, error } = await supabase
          .from('fstd_produtos')
          .select('id')
          .eq('processo_id', processoId)
          .eq('codigo_produto', product.codigo_produto)
          .single()
        if (error) throw error
        produtoId = data.id
      }

      const uploadedPaths = []
      try {
        if (fotos.length > 0) {
          for (const file of fotos) validateFstdPhoto(file)

          const { data: authData, error: authError } = await supabase.auth.getUser()
          if (authError) throw authError
          if (!authData.user) throw new Error('Sessão expirada. Entre novamente para enviar as fotos.')

          for (const [index, file] of fotos.entries()) {
            const safeProductCode = product.codigo_produto.replace(/[^a-zA-Z0-9_.-]/g, '-')
            const safeFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '-').toLowerCase()
            const uniquePart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${index}`
            const path = `${authData.user.id}/${processoId}/${safeProductCode}/${uniquePart}-${safeFileName}`
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('fstd-fotos')
              .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })

            if (uploadError) throw uploadError
            uploadedPaths.push(uploadData.path)
          }
        }

        const existingPaths = Array.isArray(fotosExistentes) ? fotosExistentes : []
        const { rpcName, args: rpcArgs } = buildSaveFstdProductCommand({
          productId: produtoId,
          completed: product.persisted?.status === 'concluido',
          standalone: Boolean(product.is_avulsa),
          divisions: (divisoes ?? []).map((division) => ({ reasonId: division.motivoId, billed: division.faturado, returned: division.retorno })),
          observation: cleanLegacyPhotoObservation(observacao),
          photoPaths: [...existingPaths, ...uploadedPaths],
          billedChicken: faturadoGalinha,
          billedQuail: faturadoCodorna,
        })

        const { data, error } = await supabase.rpc(rpcName, rpcArgs)
        if (error) throw error

        const originalPaths = Array.isArray(product.persisted?.fotos) ? product.persisted.fotos : []
        const pathsToRemove = originalPaths.filter((path) => !existingPaths.includes(path))
        if (pathsToRemove.length > 0) {
          await supabase.storage.from('fstd-fotos').remove(pathsToRemove)
        }

        return data
      } catch (error) {
        if (uploadedPaths.length > 0) {
          await supabase.storage.from('fstd-fotos').remove(uploadedPaths)
        }
        throw error
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['fstd-process', { profileId: profile.id }] })
      await queryClient.invalidateQueries({ queryKey: ['invoices', { profileId: profile.id }] })
    },
  })

  const finalizarFstdMutation = useMutation({
    mutationFn: async () => {
      const processoId = currentFstdTarget?.fstd_process_id
      if (!processoId) throw new Error('Conclua todos os produtos antes de finalizar a NFD.')

      const { data, error } = await supabase.rpc('finalizar_fstd_produtos', {
        p_processo_id: processoId,
      })
      if (error) throw error
      return data
    },
    onSuccess: (completedProcess) => {
      const refreshQueries = Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fstd-process', { profileId: profile.id }] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', { profileId: profile.id }] }),
      ])

      void refreshQueries.catch((refreshError) => {
        console.error('NÃ£o foi possÃ­vel atualizar a lista apÃ³s finalizar a FSTD.', refreshError)
      })

      if (embeddedFstd) {
        if (onEmbeddedComplete) {
          onEmbeddedComplete(completedProcess)
        } else {
          onEmbeddedClose?.()
        }
        return
      }
      setFstdTarget(undefined)
      setSelectedNfd(null)
      setStatusFilter(currentFstdTarget?.conferencia_status === 'conferida' ? 'finalizada' : 'avulsa')
    },
  })

  const fstdDocumentMutation = useMutation({
    mutationFn: async (targetOverride) => {
      const documentTarget = targetOverride ?? currentFstdTarget
      if (documentTarget?.fstd_legado) {
        const { data: legacyData, error: legacyError } = await supabase.rpc(
          'obter_fstd_legado',
          legacyFstdLookupParams(documentTarget, selectedStore),
        )
        if (legacyError) throw legacyError

        const legacyRecord = Array.isArray(legacyData) ? legacyData[0] : legacyData
        if (!legacyRecord) throw new Error('FSTD legada não encontrada para esta NFD.')
        return createLegacyFstdDocument(legacyRecord, selectedStore)
      }
      const processoId = documentTarget?.fstd_process_id
      if (!processoId || documentTarget?.fstd_process?.status !== 'concluida') {
        throw new Error('Finalize a FSTD antes de gerar o documento.')
      }

      const { data: documentData, error: documentError } = await supabase.rpc('get_or_create_fstd_document', {
        p_processo_id: processoId,
      })
      if (documentError) throw documentError

      let document = Array.isArray(documentData) ? documentData[0] : documentData
      if (!document) throw new Error('Não foi possível localizar o documento FSTD.')

      const pdfNeedsRefresh = !document.pdf_path
        || Number(document.pdf_metadata?.template_version ?? 0) !== FSTD_PDF_TEMPLATE_VERSION

      if (pdfNeedsRefresh) {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!authData.user) throw new Error('Sessão expirada. Entre novamente para visualizar o FSTD.')

        const photoUrls = await getFstdPhotoUrls(documentTarget.fstd_process)
        const pdfBlob = await generateFstdPdf({
          document,
          process: documentTarget.fstd_process,
          nfd: documentTarget,
          store: selectedStore,
          responsible: profile.nome,
          motivos: motivosQuery.data ?? [],
          photoUrls,
        })
        const pdfPath = document.pdf_path
          || `${authData.user.id}/${processoId}/${document.numero_controle}.pdf`
        const { error: uploadError } = await supabase.storage
          .from('fstd-pdfs')
          .upload(pdfPath, pdfBlob, {
            contentType: 'application/pdf',
            upsert: Boolean(document.pdf_path),
          })

        if (uploadError && !/already exists|duplicate/i.test(uploadError.message ?? '')) {
          throw uploadError
        }

        const { data: savedDocument, error: saveError } = await supabase.rpc('set_fstd_document_pdf', {
          p_document_id: document.id,
          p_pdf_path: pdfPath,
          p_pdf_metadata: {
            template_version: FSTD_PDF_TEMPLATE_VERSION,
            processo_id: processoId,
            nfd_chave_acesso: documentTarget.chave_acesso,
            nfd_numero: documentTarget.nota_fiscal,
            loja: selectedStore,
            produtos: documentTarget.fstd_process?.produtos ?? [],
          },
        })
        if (saveError) throw saveError
        document = Array.isArray(savedDocument) ? savedDocument[0] : savedDocument
      }

      if (!document?.pdf_path) throw new Error('O PDF FSTD não foi salvo no Storage.')

      const { data: signedUrl, error: signedUrlError } = await supabase.storage
        .from('fstd-pdfs')
        .createSignedUrl(document.pdf_path, 60 * 60)
      if (signedUrlError) throw signedUrlError

      return {
        controlNumber: document.numero_controle,
        url: signedUrl.signedUrl,
      }
    },
  })

  const { mutateAsync: mutateFstdDocument } = fstdDocumentMutation
  const viewFinalizedDocument = useCallback(
    (target) => mutateFstdDocument(target),
    [mutateFstdDocument],
  )

  const desconhecerMutation = useMutation({
    mutationFn: async ({ nfd, comment }) => {
      if (!nfd.loja_id) throw new Error('Não foi possível identificar a loja desta NFD.')

      const { data, error } = await supabase
        .from('nfd_desconhecimentos')
        .insert({
          loja_id: nfd.loja_id,
          usuario_id: profile.id,
          nfd_referencia: getNfdKey(nfd),
          nfd_chave_acesso: nfd.chave_acesso ? String(nfd.chave_acesso) : null,
          nfd_numero: String(getNfdNumber(nfd)),
          loja_codigo: nfd.loja_codigo ? String(nfd.loja_codigo) : null,
          comentario: comment,
        })
        .select('id')
        .single()

      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoices', { profileId: profile.id, status: 'unknown' }] })
    },
  })

  const profilePhotoMutation = useMutation({
    mutationFn: async (file) => {
      if (!profile.auth_user_id) throw new Error('Usuário sem vínculo com o login.')

      const uploaded = await uploadProfilePhoto(profile.auth_user_id, file)
      const { error } = await supabase
        .from('usuarios')
        .update({ foto_url: uploaded.path })
        .eq('id', profile.id)

      if (error) {
        await supabase.storage.from('profile-photos').remove([uploaded.path])
        throw error
      }

      return uploaded
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile', profile.auth_user_id] })
    },
  })

  async function handleProfilePhotoUpload(file) {
    const uploaded = await profilePhotoMutation.mutateAsync(file)
    setProfilePhoto(uploaded.signedUrl)
    return uploaded
  }

  const pageError = storesQuery.error?.message
    || nfdsQuery.error?.message
    || produtosCatalogQuery.error?.message
    || fstdProcessosQuery.error?.message
    || desconhecimentosQuery.error?.message
    || motivosQuery.error?.message

  if (isProfilePageOpen) {
    return (
      <>
        <ProfileScreen
          profile={profile}
          onBack={() => setProfilePageOpen(false)}
          onLogout={onLogout}
          onUploadPhoto={handleProfilePhotoUpload}
          photoBusy={profilePhotoMutation.isPending}
        />
        {conferenceAlert}
      </>
    )
  }

  if (isAvulsaOpen && selectedStore) {
    return (
      <>
        <FstdAvulsaFlow
          store={selectedStore}
          productsCatalog={produtosCatalogQuery.data ?? []}
          catalogLoading={produtosCatalogQuery.isLoading}
          busy={avulsaMutation.isPending}
          error={avulsaMutation.error?.message}
          onBack={() => setAvulsaOpen(false)}
          onCreate={async (payload) => {
            const target = await avulsaMutation.mutateAsync(payload)
            setAvulsaOpen(false)
            setFstdTarget(target)
          }}
        />
        {conferenceAlert}
      </>
    )
  }

  if (avulsaAddProductsTarget && selectedStore) {
    const existingProductKeys = (avulsaAddProductsTarget.fstd_process?.produtos ?? [])
      .map((product) => getCatalogProductKey(product))

    return (
      <>
        <FstdAvulsaFlow
          store={selectedStore}
          productsCatalog={produtosCatalogQuery.data ?? []}
          catalogLoading={produtosCatalogQuery.isLoading}
          busy={avulsaMutation.isPending}
          error={avulsaMutation.error?.message}
          initialStep="products"
          initialNfdForm={{
            numero: String(avulsaAddProductsTarget.numero ?? avulsaAddProductsTarget.nota_fiscal ?? ''),
            valor: String(avulsaAddProductsTarget.valor_total ?? ''),
            dataEmissao: avulsaAddProductsTarget.data_emissao ?? getLocalIsoDate(),
          }}
          excludedProductKeys={existingProductKeys}
          isAddingProducts
          onBack={() => setAvulsaAddProductsTarget(null)}
          onCreate={async (payload) => {
            const target = await avulsaMutation.mutateAsync(payload)
            setAvulsaAddProductsTarget(null)
            setFstdTarget(target)
          }}
        />
        {conferenceAlert}
      </>
    )
  }

  if (embeddedFinalized) {
    const embeddedLoading = storesQuery.isLoading
      || nfdsQuery.isLoading
      || produtosCatalogQuery.isLoading
      || fstdProcessosQuery.isLoading
      || motivosQuery.isLoading

    const finalizedProcess = (fstdProcessosQuery.data ?? []).find((processo) => (
      String(processo.nfd_chave_acesso) === String(currentFstdTarget?.chave_acesso)
      || (
        processo.is_avulsa
        && String(processo.loja_id) === String(selectedStore?.id)
        && String(processo.nfd_numero) === String(currentFstdTarget?.nota_fiscal ?? currentFstdTarget?.numero)
      )
    ))
    const finalizedTarget = currentFstdTarget?.fstd_process
      ? currentFstdTarget
      : finalizedProcess
        ? {
          ...currentFstdTarget,
          fstd_process_id: finalizedProcess.id,
          fstd_process_status: finalizedProcess.status,
          fstd_process: finalizedProcess,
          produtos: mergeNfdProducts(currentFstdTarget?.produtos ?? [], finalizedProcess.produtos),
        }
        : currentFstdTarget

    if (embeddedLoading) {
      return <div className="gerencial-fstd-loading">Carregando NFD finalizada...</div>
    }

    return (
      <GerencialFinalizedNfdScreen
        store={selectedStore}
        nfd={finalizedTarget}
        documentBusy={fstdDocumentMutation.isPending}
        documentError={pageError || fstdDocumentMutation.error?.message}
        onClose={onEmbeddedClose}
        onEdit={onEmbeddedEdit}
        onViewDocument={viewFinalizedDocument}
      />
    )
  }

  if (embeddedFstd) {
    const embeddedLoading = storesQuery.isLoading
      || nfdsQuery.isLoading
      || produtosCatalogQuery.isLoading
      || fstdProcessosQuery.isLoading
      || motivosQuery.isLoading

    if (embeddedLoading) {
      return <div className="gerencial-fstd-loading">Carregando FSTD...</div>
    }

    return (
      <FstdScreen
        store={{ ...selectedStore, responsavel: getFirstName(profile.nome).toUpperCase() }}
        nfd={currentFstdTarget}
        process={currentFstdTarget?.fstd_process ?? null}
        motivos={motivosQuery.data ?? []}
        busy={fstdProductMutation.isPending || legacyTotalsMutation.isPending}
        error={fstdProductMutation.error?.message || finalizarFstdMutation.error?.message}
        finalizeBusy={finalizarFstdMutation.isPending}
        legacyTotals={legacyTotalsQuery.data}
        legacyTotalsBusy={legacyTotalsQuery.isLoading}
        legacyTotalsError={legacyTotalsQuery.error?.message || legacyTotalsMutation.error?.message}
        hideBack
        embeddedFstd
        allowFinalizedEdit={allowFinalizedEdit}
        onClose={onEmbeddedClose}
        onBack={() => {}}
        onSubmitProduct={(payload) => fstdProductMutation.mutateAsync(payload)}
        onSaveLegacyTotals={(payload) => legacyTotalsMutation.mutate(payload)}
        onAddProducts={() => {}}
        onFinalize={() => finalizarFstdMutation.mutate()}
      />
    )
  }

  if (currentFstdTarget !== undefined && selectedStore) {
    return (
      <>
        <FstdScreen
          store={{ ...selectedStore, responsavel: getFirstName(profile.nome).toUpperCase() }}
          nfd={currentFstdTarget}
          process={currentFstdTarget.fstd_process ?? null}
          motivos={motivosQuery.data ?? []}
          busy={fstdProductMutation.isPending || legacyTotalsMutation.isPending}
          error={fstdProductMutation.error?.message || finalizarFstdMutation.error?.message}
          finalizeBusy={finalizarFstdMutation.isPending}
          legacyTotals={legacyTotalsQuery.data}
          legacyTotalsBusy={legacyTotalsQuery.isLoading}
          legacyTotalsError={legacyTotalsQuery.error?.message || legacyTotalsMutation.error?.message}
          onBack={() => setFstdTarget(undefined)}
          onSubmitProduct={(payload) => fstdProductMutation.mutateAsync(payload)}
          onSaveLegacyTotals={(payload) => legacyTotalsMutation.mutate(payload)}
          onAddProducts={() => setAvulsaAddProductsTarget(currentFstdTarget)}
          onFinalize={() => finalizarFstdMutation.mutate()}
        />
        {conferenceAlert}
      </>
    )
  }

  if (selectedNfd && selectedStore) {
    return (
      <>
        <NfdDetailScreen
          store={selectedStore}
          nfd={selectedNfd}
          unknownBusy={desconhecerMutation.isPending}
          unknownError={desconhecerMutation.error?.message}
          onBack={() => setSelectedNfd(null)}
          onOpenInvoice={() => {
            saveNavigation(profile.id, {
              selectedStore,
              selectedNfd,
              fstdTarget,
              storeSearch,
              nfdSearch,
              statusFilter,
            })
            openInvoice()
          }}
          onMarkUnknown={async (nfd, comment) => {
            await desconhecerMutation.mutateAsync({ nfd, comment })
            const key = getNfdKey(nfd)
            setUnknownNfdComments((current) => {
              const next = { ...current, [key]: comment }
              saveUnknownNfdComments(profile.id, next)
              return next
            })
            setSelectedNfd(null)
            setStatusFilter('outros')
          }}
          onOpenFstd={setFstdTarget}
        />
        {conferenceAlert}
      </>
    )
  }

  if (selectedStore) {
    return (
      <div className="promotor-app-shell">
        {pageError && <strong className="promotor-page-error">{pageError}</strong>}
        <StoreDetailScreen
          store={selectedStore}
          nfds={selectedStoreNfds}
          statusFilter={statusFilter}
          search={nfdSearch}
          onSearch={setNfdSearch}
          onStatusFilter={setStatusFilter}
          onBack={() => {
            setSelectedStore(null)
            setNfdSearch('')
            setStatusFilter('atrasada')
          }}
          onOpenNfd={setSelectedNfd}
          onOpenAvulsa={() => {
            setSelectedNfd(null)
            setFstdTarget(undefined)
            setAvulsaOpen(true)
          }}
        />
        {conferenceAlert}
      </div>
    )
  }

  return (
    <div className="promotor-app-shell">
      {pageError && <strong className="promotor-page-error">{pageError}</strong>}
      <StoresScreen
        stores={stores}
        nfds={nfds}
        loading={storesQuery.isLoading || nfdsQuery.isLoading}
        search={storeSearch}
        onSearch={setStoreSearch}
        onMenu={() => setProfileMenuOpen((open) => !open)}
        onCloseProfileMenu={() => setProfileMenuOpen(false)}
        onLogout={onLogout}
        onUploadPhoto={handleProfilePhotoUpload}
        photoBusy={profilePhotoMutation.isPending}
        profile={profile}
        profileMenuOpen={isProfileMenuOpen}
        profilePhoto={profilePhoto}
        onOpenStore={(store) => {
          setProfileMenuOpen(false)
          setSelectedStore(store)
          setStatusFilter('atrasada')
        }}
      />
      {conferenceAlert}
    </div>
  )
}
