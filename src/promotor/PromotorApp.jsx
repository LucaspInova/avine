import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider.jsx'
import { supabase } from '../lib/supabaseClient'
import { getProfilePhotoSignedUrl, uploadProfilePhoto } from '../lib/profilePhoto'
import avineLogo from '../assets/foto_logoavine.png'
import {
  clearPromotorNavigation,
  readPromotorNavigation,
  savePromotorNavigation,
} from './navigationState'
import './PromotorApp.css'

const statusTabs = [
  { id: 'atrasada', label: 'Atrasadas' },
  { id: 'finalizada', label: 'Finalizadas' },
  { id: 'avulsa', label: 'Avulsas' },
  { id: 'outros', label: 'Outros' },
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

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`))
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

function getDaysSinceIssue(date) {
  if (!date) return 0

  const issueDate = new Date(`${date}T00:00:00`)
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const difference = todayStart.getTime() - issueDate.getTime()

  return Math.floor(difference / 86400000)
}

function getNfdVisualStatus(nfd, unknownComments = {}) {
  if (unknownComments[getNfdKey(nfd)]) return 'unknown'

  if (nfd?.data_envio || (nfd?.fstd_status && nfd.fstd_status !== 'cancelada')) {
    return 'sent'
  }

  return getDaysSinceIssue(nfd?.data_emissao) >= 1 ? 'overdue' : 'on-time'
}

function getNfdTabStatus(nfd, unknownComments) {
  const visualStatus = getNfdVisualStatus(nfd, unknownComments)
  if (visualStatus === 'sent') return 'finalizada'
  if (visualStatus === 'overdue') return 'atrasada'
  return 'outros'
}

function getBilledGal(nfd) {
  return Number(nfd?.quantidade_galinha ?? 0)
}

function getBilledCod(nfd) {
  return Number(nfd?.quantidade_codorna ?? 0)
}

function getNfdReturnRates(nfd) {
  const billedGal = getBilledGal(nfd)
  const billedCod = getBilledCod(nfd)
  const billedProductsByCode = new Map(
    (nfd?.produtos ?? []).map((product) => [
      String(product.codigo_produto ?? '').trim().toUpperCase(),
      product,
    ]),
  )
  let returnedGal = 0
  let returnedCod = 0

  for (const returnedProduct of nfd?.fstd_process?.produtos ?? []) {
    const billedProduct = billedProductsByCode.get(
      String(returnedProduct.codigo_produto ?? '').trim().toUpperCase(),
    )
    const productBilledGal = Number(
      returnedProduct.quantidade_faturada_galinha ?? billedProduct?.quantidade_faturada_galinha ?? 0,
    )
    const productBilledCod = Number(
      returnedProduct.quantidade_faturada_codorna ?? billedProduct?.quantidade_faturada_codorna ?? 0,
    )
    const returned = Math.max(0, Number(returnedProduct.quantidade_retorno ?? 0))

    if (productBilledGal > 0 && productBilledCod > 0) {
      const productTotalBilled = productBilledGal + productBilledCod
      returnedGal += returned * (productBilledGal / productTotalBilled)
      returnedCod += returned * (productBilledCod / productTotalBilled)
    } else if (productBilledGal > 0) {
      returnedGal += returned
    } else if (productBilledCod > 0) {
      returnedCod += returned
    }
  }

  const percentage = (returned, billed) => {
    if (billed <= 0) return 0
    return Math.min(100, Math.max(0, (returned / billed) * 100))
  }

  return {
    galinha: percentage(returnedGal, billedGal),
    codorna: percentage(returnedCod, billedCod),
  }
}

function formatReturnPercentage(value) {
  return value.toFixed(2).replace('.', ',')
}

function getProductImageCandidates(value) {
  const url = String(value ?? '').trim()
  if (!url) return []

  const id = url.match(/[?&]id=([^&#]+)/i)?.[1]
    || url.match(/(?:drive|docs)\.google\.com\/(?:file|document)\/d\/([^/?#=]+)/i)?.[1]
    || url.match(/googleusercontent\.com\/d\/([^/?#=]+)/i)?.[1]

  if (!id) return [url]

  const driveCandidates = [
    `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
    `https://drive.google.com/uc?export=view&id=${id}`,
    `https://lh3.googleusercontent.com/d/${id}=w1000`,
  ]

  const isDrivePreviewPage = /(?:drive|docs)\.google\.com\/(?:file|document)\/d\//i.test(url)
  return [...new Set(isDrivePreviewPage ? driveCandidates : [url, ...driveCandidates])]
}

function getNfdProducts(nfd, productsCatalog = []) {
  const catalogByCode = new Map(
    productsCatalog.map((product) => [String(product.codigo_produto ?? '').trim().toUpperCase(), product]),
  )
  const details = Array.isArray(nfd?.detalhes) ? nfd.detalhes : []

  return details
    .map((detail) => {
      const codigo = String(detail?.codigo_produto ?? '').trim().toUpperCase()
      const catalog = catalogByCode.get(codigo)
      if (!codigo) return null

      return {
        codigo_produto: codigo,
        produto_id: catalog?.produto_id ?? null,
        nome: catalog?.nome ?? detail?.descricao_produto ?? codigo,
        descricao: detail?.descricao_produto ?? catalog?.nome ?? null,
        imagem_url: catalog?.imagem_url ?? '',
        quantidade_faturada_galinha: Number(detail?.quantidade_galinha ?? 0),
        quantidade_faturada_codorna: Number(detail?.quantidade_codorna ?? 0),
      }
    })
    .filter(Boolean)
}

const PROMOTOR_UNKNOWN_NFD_KEY = 'fstd-promotor-unknown-nfds'

function getNfdKey(nfd) {
  return `${nfd?.codigo_cliente ?? nfd?.loja_codigo ?? ''}:${nfd?.nota_fiscal ?? nfd?.numero ?? ''}`
}

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

async function fetchAllNfdNotas(select, configureQuery) {
  const pageSize = 1000
  const rows = []

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from('nfd_notas').select(select)
    query = configureQuery ? configureQuery(query) : query

    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) throw error

    rows.push(...(data ?? []))
    if ((data ?? []).length < pageSize) break
  }

  return rows
}

function filterBySearch(items, search, fields) {
  const query = search.trim().toLowerCase()
  if (!query) return items

  return items.filter((item) =>
    fields.some((field) => String(item[field] ?? '').toLowerCase().includes(query)),
  )
}

function AppHeader({ title, onBack, onLogout, onMenu }) {
  return (
    <header className="mobile-header">
      <div className="mobile-titlebar">
        {onBack ? (
          <button className="mobile-icon-button" type="button" onClick={onBack} aria-label="Voltar">
            ‹
          </button>
        ) : (
          <span className="mobile-spacer" />
        )}
        <strong>{title}</strong>
        {onMenu ? (
          <button className="mobile-user-menu-button" type="button" onClick={onMenu} aria-label="Abrir perfil e opções" title="Perfil e opções">
            <svg className="mobile-user-menu-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="8" r="3.3" />
              <path strokeLinecap="round" d="M5.5 19c.8-3.2 3.1-5 6.5-5s5.7 1.8 6.5 5" />
            </svg>
          </button>
        ) : onLogout ? (
          <button className="mobile-icon-button mobile-logout-button" type="button" onClick={onLogout} aria-label="Sair" title="Sair">
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
    </header>
  )
}

function SearchField({ value, onChange }) {
  return (
    <label className="mobile-search">
      <span aria-hidden="true">⌕</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Procurar"
        type="search"
      />
    </label>
  )
}

function EmptyNotice({ children }) {
  return (
    <div className="empty-notice">
      <span aria-hidden="true">♡</span>
      <strong>{children}</strong>
    </div>
  )
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

function InvoiceIcon({ status }) {
  return (
    <svg
      className={`document-glyph is-${status}`}
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
              <strong>{profile?.perfil ?? 'Promotor'}</strong>
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

function StoresScreen({ stores, nfds, loading, search, onSearch, onMenu, onOpenStore }) {
  const query = search.trim().toLowerCase()
  const filteredStores = filterBySearch(stores, query, ['nome', 'codigo', 'cidade', 'uf'])

  return (
    <main className="promotor-app">
      <AppHeader title="Lojas" onMenu={onMenu} />

      <section className="mobile-card stores-card">
        <SearchField value={search} onChange={onSearch} />

        {loading && <p className="mobile-muted">Carregando lojas...</p>}

        {!loading && filteredStores.length === 0 && (
          <p className="mobile-muted">Nenhuma loja vinculada ao seu usuário.</p>
        )}

        <div className="store-rows">
          {filteredStores.map((store) => {
            const storeNfds = nfds.filter((nfd) => nfd.loja_id === store.id)
            const overdueNotes = storeNfds.filter((nfd) => nfd.status_nfd === 'atrasada').length
            const otherNotes = storeNfds.filter((nfd) => nfd.status_nfd === 'outros').length
            const pendingNotes = overdueNotes + otherNotes
            const storeIconStatus = overdueNotes > 0 ? 'overdue' : otherNotes > 0 ? 'other' : 'clear'

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

function StoreDetailScreen({
  store,
  nfds,
  statusFilter,
  search,
  onSearch,
  onStatusFilter,
  onBack,
  onOpenNfd,
  onOpenFstd,
}) {
  const visibleNfds = filterBySearch(
    nfds.filter((nfd) => nfd.status_nfd === statusFilter),
    search,
    ['numero', 'data_emissao'],
  )
  const isPendingTab = statusFilter === 'atrasada'

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
        {isPendingTab && visibleNfds.length === 0 ? (
          <EmptyNotice>0 Notas Pendentes!</EmptyNotice>
        ) : (
          <>
            <SearchField value={search} onChange={onSearch} />

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
          </>
        )}

        <button className="avulsa-button" type="button" onClick={() => onOpenFstd(null)}>
          + FSTD Avulsa
        </button>
      </section>
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
          <span>Comentário <small>Necessário</small></span>
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

function NfdDetailScreen({ store, nfd, onBack, onOpenInvoice, onOpenFstd, onMarkUnknown, unknownBusy, unknownError }) {
  const [invoiceCopied, setInvoiceCopied] = useState(false)
  const [isUnknownOpen, setUnknownOpen] = useState(false)
  const [unknownComment, setUnknownComment] = useState('')
  const visualStatus = nfd.visual_status ?? getNfdVisualStatus(nfd)
  const returnRates = getNfdReturnRates(nfd)
  const isFinalized = visualStatus === 'sent' || nfd.status_nfd === 'finalizada'

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

        <div className="nfd-actions">
          <button
            type="button"
            onClick={handleOpenInvoice}
          >
            <NfdActionIcon name="invoice" />
            Nota Fiscal
          </button>
          <button className="unknown-nfd-button" type="button" onClick={() => setUnknownOpen(true)}>
            <NfdActionIcon name="unknown" />
            Desconheço NFD
          </button>
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

function FieldCard({ title, icon, children }) {
  return (
    <section className="fstd-card">
      <h2>
        {icon && <FstdSectionIcon type={icon} />}
        <span>{title}</span>
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
      form.fotos.length > 0 ? `Fotos selecionadas: ${form.fotos.map((file) => file.name).join(', ')}` : '',
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
          <button type="submit" disabled={!canSubmit}>{busy ? 'Enviando' : 'Enviar'}</button>
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
                <small>Necessário</small>
              </span>
              <select
                value={form.motivoId}
                onChange={(event) => updateForm({ motivoId: event.target.value })}
              >
                <option value="">Selecione</option>
                {motivos.map((motivo) => (
                  <option key={motivo.id} value={motivo.id}>
                    {motivo.nome}
                  </option>
                ))}
              </select>
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
                <small>Necessário</small>
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
                <small>Necessário</small>
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

          <FieldCard title="Fotos">
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
  const imageCandidates = getProductImageCandidates(src)
  const candidateIndex = imageState.src === src ? imageState.index : 0

  if (imageCandidates.length === 0 || candidateIndex >= imageCandidates.length) {
    return <div className={`fstd-product-image fstd-product-image-placeholder ${className}`}>Sem imagem</div>
  }

  return (
    <img
      alt={alt}
      className={`fstd-product-image ${className}`}
      onError={() => setImageState((current) => ({
        src,
        index: (current.src === src ? current.index : 0) + 1,
      }))}
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
        retorno: String(normalizeNonNegativeQuantity(division.quantidade)),
      }))
    : []

  if (persistedDivisions.length > 0) return persistedDivisions

  if (product.persisted?.motivo_id && (product.persisted.quantidade_faturada_galinha + product.persisted.quantidade_faturada_codorna) > 0) {
    return [{
      motivoId: product.persisted.motivo_id,
      faturado: String(product.persisted.quantidade_faturada_galinha + product.persisted.quantidade_faturada_codorna),
      retorno: String(normalizeNonNegativeQuantity(product.persisted.quantidade_retorno)),
    }]
  }

  const totalBilled = Number(product.quantidade_faturada_galinha ?? 0)
    + Number(product.quantidade_faturada_codorna ?? 0)

  return [{ motivoId: '', faturado: String(Math.max(0, totalBilled)), retorno: '0' }]
}

function getFstdStoredPhotoPaths(product) {
  return Array.isArray(product.persisted?.fotos)
    ? product.persisted.fotos.filter((path) => typeof path === 'string' && path.trim())
    : []
}

function getEditableObservation(value) {
  return String(value ?? '')
    .replace(/^(?:Observações:\s*)+/i, '')
    .trim()
}

function FstdStoredPhotos({ paths, removable = false, onRemove }) {
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
    <div className="fstd-photo-previews fstd-stored-photo-previews">
      {(photoQuery.data ?? paths.map((path) => ({ path, url: '' }))).map((photo, index) => (
        <div className="fstd-photo-preview fstd-stored-photo-preview" key={photo.path}>
          {photo.url ? <img alt={`Foto enviada ${index + 1}`} src={photo.url} /> : <span>Foto</span>}
          {removable && (
            <button aria-label={`Remover foto ${index + 1}`} onClick={() => onRemove?.(photo.path)} type="button">×</button>
          )}
        </div>
      ))}
    </div>
  )
}

function FstdProductForm({ product, motivos, busy, error, onBack, onSubmit }) {
  const isEditing = product.persisted?.status === 'concluido'
  const [form, setForm] = useState(() => ({
    ...initialFstdForm,
    divisoes: getFstdDivisionDefaults(product),
    faturadoGalinha: String(product.persisted?.quantidade_faturada_galinha ?? product.quantidade_faturada_galinha ?? 0),
    faturadoCodorna: String(product.persisted?.quantidade_faturada_codorna ?? product.quantidade_faturada_codorna ?? 0),
    fotosExistentes: isEditing ? getFstdStoredPhotoPaths(product) : [],
    lotes: isEditing ? getEditableObservation(product.persisted?.observacao) : '',
  }))
  const photoPreviews = useMemo(
    () => form.fotos.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [form.fotos],
  )
  const billedGalinha = Number(product.persisted?.quantidade_faturada_galinha ?? product.quantidade_faturada_galinha ?? 0)
  const billedCodorna = Number(product.persisted?.quantidade_faturada_codorna ?? product.quantidade_faturada_codorna ?? 0)
  const totalBilled = billedGalinha + billedCodorna
  const totalDivisionBilled = form.divisoes.reduce((total, division) => total + normalizeQuantity(division.faturado), 0)
  const totalReturn = form.divisoes.reduce((total, division) => total + normalizeNonNegativeQuantity(division.retorno), 0)
  const remainingBilled = Math.max(0, totalBilled - totalDivisionBilled)
  const showGeneral = totalDivisionBilled !== totalBilled
  const divisionsAreValid = form.divisoes.every(
    (division) => Boolean(division.motivoId)
      && normalizeQuantity(division.faturado) > 0
      && String(division.retorno).trim() !== ''
      && normalizeNonNegativeQuantity(division.retorno) <= normalizeQuantity(division.faturado),
  )
  const canSubmit = Boolean(
    totalBilled > 0
      && divisionsAreValid
      && totalDivisionBilled === totalBilled
      && !busy,
  )

  useEffect(() => {
    return () => photoPreviews.forEach((preview) => URL.revokeObjectURL(preview.url))
  }, [photoPreviews])

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }))
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
      divisoes: [...current.divisoes, { motivoId: '', faturado: '', retorno: '0' }],
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
    <main className="promotor-app fstd-app fstd-product-page">
      <form className="fstd-mobile-form fstd-product-form" onSubmit={handleSubmit}>
        <header className="fstd-topbar">
          <button type="button" onClick={onBack}>‹</button>
          <span />
          <button type="submit" disabled={!canSubmit}>{busy ? 'Enviando' : isEditing ? 'Salvar' : 'Concluir'}</button>
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
                    <small>Necessário</small>
                  </span>
                  <select value={division.motivoId} onChange={(event) => updateDivision(index, { motivoId: event.target.value })}>
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
                  </select>
                </label>
                <label className="mobile-field">
                  <span>Faturado</span>
                  <div className="unit-input">
                    <input
                      max={Math.max(0, totalBilled - (totalDivisionBilled - normalizeQuantity(division.faturado)))}
                      min="1"
                      inputMode="numeric"
                      onChange={(event) => updateDivision(index, { faturado: event.target.value })}
                      type="number"
                      value={division.faturado}
                    />
                    <em>ovos</em>
                  </div>
                </label>
                <label className="mobile-field">
                  <span>Retorno</span>
                  <div className="unit-input">
                    <input
                      max={normalizeQuantity(division.faturado)}
                      min="0"
                      inputMode="numeric"
                      onChange={(event) => updateDivision(index, { retorno: event.target.value })}
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
          </FieldCard>

          {showGeneral && (
            <FieldCard icon="chart" title="Geral">
              <label className="mobile-field">
                <span>Faturado geral <small>Da nota</small></span>
                <input disabled value={`${totalBilled} ovos`} />
              </label>
              {totalDivisionBilled > 0 && remainingBilled > 0 && (
                <button className="fstd-add-reason" onClick={addDivision} type="button">
                  + Adicionar outro motivo
                </button>
              )}
              <p className="fstd-quantity-breakdown">
                Galinha: {form.faturadoGalinha} · Codorna: {form.faturadoCodorna}
              </p>
              <p className="fstd-quantity-breakdown">
                Faturado por motivos: {totalDivisionBilled} de {totalBilled} ovos
              </p>
              <p className="fstd-return-total">
                Retorno informado: {totalReturn} ovos
              </p>
              {totalDivisionBilled > totalBilled && <strong className="fstd-quantity-error">A soma dos faturados por motivo não pode passar do faturado geral.</strong>}
              {totalDivisionBilled > 0 && totalDivisionBilled < totalBilled && (
                <small className="fstd-quantity-hint">Distribua mais {remainingBilled} ovos nos faturados dos motivos para poder enviar.</small>
              )}
              {totalReturn > totalBilled && <strong className="fstd-quantity-error">A quantidade não pode passar do faturado.</strong>}
            </FieldCard>
          )}

          <FieldCard title="Fotos">
            <label className="photo-button">
              <input
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => updateForm({ fotos: Array.from(event.target.files ?? []) })}
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
          <button type="submit" disabled={!canSubmit}>{busy ? 'Enviando' : 'Enviar'}</button>
        </footer>
      </form>
    </main>
  )
}

function FstdProductSummary({ store, nfd, product, motivos, canEdit, error, onBack, onEdit }) {
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
        <strong>FSTD</strong>
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

function FstdScreen({ store, nfd, motivos, process, busy, error, finalizeBusy, onBack, onSubmitProduct, onFinalize }) {
  const [selectedProductCode, setSelectedProductCode] = useState(null)
  const [selectedProductMode, setSelectedProductMode] = useState(null)
  const processProducts = process?.produtos ?? []
  const persistedByCode = new Map(processProducts.map((product) => [product.codigo_produto, product]))
  const products = (nfd?.produtos ?? []).map((product) => ({
    ...product,
    persisted: persistedByCode.get(product.codigo_produto),
  }))
  const allCompleted = products.length > 0 && products.every((product) => product.persisted?.status === 'concluido')
  const processFinalized = process?.status === 'concluida'
  const selectedProduct = products.find((product) => product.codigo_produto === selectedProductCode)

  if (selectedProduct && selectedProductMode === 'view') {
    return (
      <FstdProductSummary
        store={store}
        nfd={nfd}
        product={selectedProduct}
        motivos={motivos}
        canEdit={!processFinalized}
        error={error}
        onBack={() => {
          setSelectedProductCode(null)
          setSelectedProductMode(null)
        }}
        onEdit={() => setSelectedProductMode('edit')}
      />
    )
  }

  if (selectedProduct) {
    return (
      <FstdProductForm
        product={selectedProduct}
        motivos={motivos}
        busy={busy}
        error={error}
        onBack={() => {
          if (selectedProduct.persisted?.status === 'concluido') {
            setSelectedProductMode('view')
          } else {
            setSelectedProductCode(null)
            setSelectedProductMode(null)
          }
        }}
        onSubmit={async (payload) => {
          await onSubmitProduct(payload)
          if (selectedProduct.persisted?.status === 'concluido') {
            setSelectedProductMode('view')
          } else {
            setSelectedProductCode(null)
            setSelectedProductMode(null)
          }
        }}
      />
    )
  }

  return (
    <main className="promotor-app fstd-app fstd-list-page">
      <header className="fstd-list-topbar">
        <button type="button" onClick={onBack}>‹</button>
        <strong>FSTD</strong>
        <span />
      </header>

      <section className="fstd-list-hero">
        <img src={avineLogo} alt="Avine" />
        <div>
          <h1>{getStoreTitle(store)}</h1>
          <p>NFD: {getNfdNumber(nfd)} / CÓD: {getStoreCode(store, nfd)}</p>
        </div>
      </section>

      <div className="fstd-product-list">
        {products.length === 0 && <p className="fstd-empty">Esta NFD não possui produtos detalhados para realizar a FSTD.</p>}
        {products.map((product) => {
          const completed = product.persisted?.status === 'concluido'
          return (
            <button
              className="fstd-product-row"
              disabled={processFinalized && !completed}
              key={product.codigo_produto}
              onClick={() => {
                setSelectedProductCode(product.codigo_produto)
                setSelectedProductMode(completed ? 'view' : 'edit')
              }}
              type="button"
            >
              <span className={`fstd-status-dot ${completed ? 'is-complete' : ''}`} aria-label={completed ? 'Produto concluído' : 'Produto pendente'} />
              <span className="fstd-product-row-copy">
                <strong>{product.nome}</strong>
            <small>
              Fat: {Number(product.persisted?.quantidade_faturada_galinha ?? product.quantidade_faturada_galinha ?? 0)
                + Number(product.persisted?.quantidade_faturada_codorna ?? product.quantidade_faturada_codorna ?? 0)} ovos
              {' · '}Ret: {completed ? product.persisted.quantidade_retorno : '?'}
            </small>
              </span>
              <span className="fstd-product-arrow">›</span>
            </button>
          )
        })}
      </div>

      {error && <strong className="promotor-error fstd-list-error">{error}</strong>}
      {allCompleted && (
        <button className="fstd-finalize-button" disabled={finalizeBusy} onClick={onFinalize} type="button">
          {finalizeBusy ? 'Finalizando...' : 'Finalizar'}
        </button>
      )}
    </main>
  )
}

function PromotorWorkspace({ profile, onLogout }) {
  const queryClient = useQueryClient()
  const [savedNavigation] = useState(() => readPromotorNavigation(profile.id))
  const [selectedStore, setSelectedStore] = useState(() => savedNavigation?.selectedStore ?? null)
  const [selectedNfd, setSelectedNfd] = useState(() => savedNavigation?.selectedNfd ?? null)
  const [fstdTarget, setFstdTarget] = useState(() => savedNavigation?.fstdTarget)
  const [storeSearch, setStoreSearch] = useState(() => savedNavigation?.storeSearch ?? '')
  const [nfdSearch, setNfdSearch] = useState(() => savedNavigation?.nfdSearch ?? '')
  const [statusFilter, setStatusFilter] = useState(() => savedNavigation?.statusFilter ?? 'atrasada')
  const [unknownNfdComments, setUnknownNfdComments] = useState(() => readUnknownNfdComments(profile.id))
  const [isProfileOpen, setProfileOpen] = useState(false)

  useEffect(() => {
    savePromotorNavigation(profile.id, {
      selectedStore,
      selectedNfd,
      fstdTarget,
      storeSearch,
      nfdSearch,
      statusFilter,
    })
  }, [fstdTarget, nfdSearch, profile.id, selectedNfd, selectedStore, statusFilter, storeSearch])

  const storesQuery = useQuery({
    queryKey: ['promotor', 'lojas', profile.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lojas')
        .select('id, codigo, nome, uf, cidade')
        .order('nome', { ascending: true })

      if (error) throw error
      return data ?? []
    },
  })

  const nfdsQuery = useQuery({
    enabled: (storesQuery.data?.length ?? 0) > 0,
    queryKey: ['promotor', 'nfds', profile.id],
    queryFn: async () => {
      const storesByCode = new Map(
        (storesQuery.data ?? []).map((store) => [String(store.codigo), store]),
      )
      const storeCodes = [...storesByCode.keys()]
        .map((code) => Number(code))
        .filter((code) => Number.isFinite(code))

      if (storeCodes.length === 0) return []

      const data = await fetchAllNfdNotas(
        'chave_acesso, nota_fiscal, data_emissao, codigo_cliente, nome_abreviado, uf, cidade, quantidade_galinha, quantidade_codorna, valor_total, detalhes',
        (query) =>
          query
            .in('codigo_cliente', storeCodes)
            .order('data_emissao', { ascending: false })
            .order('nota_fiscal', { ascending: false }),
      )

      return data.map((nota) => {
        const store = storesByCode.get(String(nota.codigo_cliente))
        return {
          ...nota,
          id: nota.chave_acesso,
          loja_id: store?.id ?? null,
          loja_codigo: String(nota.codigo_cliente),
          loja_nome: nota.nome_abreviado,
          numero: String(nota.nota_fiscal),
          quantidade_galinha: nota.quantidade_galinha,
          quantidade_codorna: nota.quantidade_codorna,
          valor_total: nota.valor_total,
          status_nfd: 'outros',
          fstd_id: null,
          fstd_status: null,
        }
      })
    },
  })

  const produtosCatalogQuery = useQuery({
    queryKey: ['promotor', 'produtos-catalogo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produtos_expandidos')
        .select('produto_id, codigo_produto, nome, ovos_und, categoria, imagem_url')
        .eq('status', true)
        .order('nome', { ascending: true })

      if (error) throw error
      return data ?? []
    },
  })

  const fstdProcessosQuery = useQuery({
    queryKey: ['promotor', 'fstd-processos', profile.id],
    queryFn: async () => {
      const { data: processos, error: processosError } = await supabase
        .from('fstd_processos')
        .select('id, nfd_chave_acesso, nfd_numero, status, finalizada_em')
        .order('created_at', { ascending: false })

      if (processosError) throw processosError
      if (!processos?.length) return []

      const processIds = processos.map((processo) => processo.id)
      const { data: produtos, error: produtosError } = await supabase
        .from('fstd_produtos')
        .select('id, processo_id, codigo_produto, quantidade_faturada_galinha, quantidade_faturada_codorna, quantidade_retorno, motivo_id, observacao, fotos, status, concluido_em')
        .in('processo_id', processIds)

      if (produtosError) throw produtosError

      const produtoIds = (produtos ?? []).map((produto) => produto.id)
      const { data: divisoes, error: divisoesError } = produtoIds.length > 0
        ? await supabase
          .from('fstd_produto_motivos')
          .select('produto_id, motivo_id, quantidade_faturada, quantidade')
          .in('produto_id', produtoIds)
        : { data: [], error: null }

      if (divisoesError) throw divisoesError

      return processos.map((processo) => ({
        ...processo,
        produtos: (produtos ?? [])
          .filter((produto) => produto.processo_id === processo.id)
          .map((produto) => ({
            ...produto,
            divisoes: (divisoes ?? []).filter((division) => division.produto_id === produto.id),
          })),
      }))
    },
  })

  const desconhecimentosQuery = useQuery({
    queryKey: ['promotor', 'nfd-desconhecimentos', profile.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfd_desconhecimentos')
        .select('nfd_referencia, comentario, created_at')
        .eq('promotor_id', profile.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
  })

  const motivosQuery = useQuery({
    queryKey: ['promotor', 'motivos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('motivos_devolucao')
        .select('id, nome, ordem, ativo')
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })

      if (error) throw error
      return data ?? []
    },
  })

  const stores = storesQuery.data ?? []
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
    () => new Map((fstdProcessosQuery.data ?? []).map((processo) => [String(processo.nfd_chave_acesso), processo])),
    [fstdProcessosQuery.data],
  )
  const nfds = useMemo(
    () => (nfdsQuery.data ?? []).map((nfd) => {
      const processo = fstdProcessosByNfd.get(String(nfd.chave_acesso))
      const visualStatus = processo?.status === 'concluida'
        ? 'sent'
        : getNfdVisualStatus(nfd, allUnknownNfdComments)

      return {
        ...nfd,
        produtos: getNfdProducts(nfd, produtosCatalogQuery.data ?? []),
        fstd_process_id: processo?.id ?? null,
        fstd_process_status: processo?.status ?? null,
        fstd_process: processo ?? null,
        visual_status: visualStatus,
        status_nfd: visualStatus === 'sent' ? 'finalizada' : getNfdTabStatus(nfd, allUnknownNfdComments),
      }
    }),
    [allUnknownNfdComments, fstdProcessosByNfd, nfdsQuery.data, produtosCatalogQuery.data],
  )
  const selectedStoreNfds = selectedStore ? nfds.filter((nfd) => nfd.loja_id === selectedStore.id) : []
  const currentFstdTarget = fstdTarget
    ? nfds.find((nfd) => String(nfd.chave_acesso) === String(fstdTarget.chave_acesso)) ?? fstdTarget
    : undefined

  const fstdProductMutation = useMutation({
    mutationFn: async ({ product, divisoes, observacao, fotos = [], fotosExistentes = [], faturadoGalinha, faturadoCodorna }) => {
      let processoId = currentFstdTarget?.fstd_process_id

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
        const rpcName = product.persisted?.status === 'concluido'
          ? 'editar_fstd_produto'
          : 'concluir_fstd_produto'
        const rpcArgs = {
          p_produto_id: produtoId,
          p_divisoes: (divisoes ?? []).map((division) => ({
            motivo_id: division.motivoId,
            quantidade_faturada: division.faturado,
            quantidade_retorno: division.retorno,
          })),
          p_observacao: observacao,
          p_fotos: [...existingPaths, ...uploadedPaths],
        }

        if (rpcName === 'editar_fstd_produto') {
          rpcArgs.p_quantidade_faturada_galinha = faturadoGalinha
          rpcArgs.p_quantidade_faturada_codorna = faturadoCodorna
        }

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
      await queryClient.invalidateQueries({ queryKey: ['promotor', 'fstd-processos', profile.id] })
      await queryClient.invalidateQueries({ queryKey: ['promotor', 'nfds', profile.id] })
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['promotor', 'fstd-processos', profile.id] })
      await queryClient.invalidateQueries({ queryKey: ['promotor', 'nfds', profile.id] })
      setFstdTarget(undefined)
      setSelectedNfd(null)
      setStatusFilter('finalizada')
    },
  })

  const desconhecerMutation = useMutation({
    mutationFn: async ({ nfd, comment }) => {
      if (!nfd.loja_id) throw new Error('Não foi possível identificar a loja desta NFD.')

      const { data, error } = await supabase
        .from('nfd_desconhecimentos')
        .insert({
          loja_id: nfd.loja_id,
          promotor_id: profile.id,
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
      await queryClient.invalidateQueries({ queryKey: ['promotor', 'nfd-desconhecimentos', profile.id] })
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
      await queryClient.invalidateQueries({ queryKey: ['promotor', 'profile', profile.auth_user_id] })
    },
  })

  const pageError = storesQuery.error?.message
    || nfdsQuery.error?.message
    || produtosCatalogQuery.error?.message
    || fstdProcessosQuery.error?.message
    || desconhecimentosQuery.error?.message
    || motivosQuery.error?.message

  if (isProfileOpen) {
    return (
      <ProfileScreen
        profile={profile}
        onBack={() => setProfileOpen(false)}
        onLogout={onLogout}
        onUploadPhoto={(file) => profilePhotoMutation.mutateAsync(file)}
        photoBusy={profilePhotoMutation.isPending}
      />
    )
  }

  if (currentFstdTarget !== undefined && selectedStore) {
    return (
      <FstdScreen
        store={{ ...selectedStore, responsavel: getFirstName(profile.nome).toUpperCase() }}
        nfd={currentFstdTarget}
        process={currentFstdTarget.fstd_process ?? null}
        motivos={motivosQuery.data ?? []}
        busy={fstdProductMutation.isPending}
        error={fstdProductMutation.error?.message || finalizarFstdMutation.error?.message}
        finalizeBusy={finalizarFstdMutation.isPending}
        onBack={() => setFstdTarget(undefined)}
        onSubmitProduct={(payload) => fstdProductMutation.mutateAsync(payload)}
        onFinalize={() => finalizarFstdMutation.mutate()}
      />
    )
  }

  if (selectedNfd && selectedStore) {
    return (
      <NfdDetailScreen
        store={selectedStore}
        nfd={selectedNfd}
        unknownBusy={desconhecerMutation.isPending}
        unknownError={desconhecerMutation.error?.message}
        onBack={() => setSelectedNfd(null)}
        onOpenInvoice={() => {
          savePromotorNavigation(profile.id, {
            selectedStore,
            selectedNfd,
            fstdTarget,
            storeSearch,
            nfdSearch,
            statusFilter,
          })
          window.open('https://meudanfe.com.br/', '_blank', 'noopener,noreferrer')
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
          onOpenFstd={setFstdTarget}
        />
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
        onMenu={() => setProfileOpen(true)}
        onOpenStore={(store) => {
          setSelectedStore(store)
          setStatusFilter('atrasada')
        }}
      />
    </div>
  )
}

function PromotorApp() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    session,
    profile,
    loading: authLoading,
    signOut,
  } = useAuth()
  const isAllowed = profile?.perfil === 'Promotor'
    && profile?.ativo
    && profile?.acesso_habilitado

  async function handleLogout() {
    if (profile?.id) clearPromotorNavigation(profile.id)
    await signOut()
    queryClient.clear()
    navigate('/', { replace: true })
  }

  if (authLoading) {
    return (
      <main className="promotor-loading">
        <span>Carregando FSTD Digital...</span>
      </main>
    )
  }

  if (!session || !isAllowed) {
    return <Navigate to="/" replace />
  }

  return <PromotorWorkspace profile={profile} onLogout={handleLogout} />
}

export default PromotorApp
