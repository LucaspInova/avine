import { useEffect, useMemo, useRef, useState } from 'react'
import { GerencialFinalizedNfdModal } from '../fstd/GerencialFinalizedNfdModal.jsx'
import { GerencialFstdModal } from '../fstd/GerencialFstdModal.jsx'
import { AppSelect, Pagination, SearchField } from '../../../../shared/ui'
import { hydrateAttachedPhotoRecords, listAttachedPhotoNfds } from '../../../../domains/fstd/attachedPhotosRepository.js'
import './AttachedPhotosScreen.css'

const CARDS_PER_PAGE = 20
const HYDRATED_PAGE_CACHE_TTL_MS = 59 * 60 * 1000

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function formatSentAt(value) {
  if (!value) return 'Data não informada'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data não informada'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

function buildFinalizedNote(record) {
  return {
    id: record.accessKey || record.id, chave_acesso: record.accessKey, nota_fiscal: record.nfdNumber, numero: record.nfdNumber,
    data_emissao: record.issueDate, codigo_cliente: record.store?.codigo, nome_abreviado: record.storeName,
    loja_id: record.store?.id, loja_codigo: record.store?.codigo, loja_nome: record.storeName,
    quantidade_galinha: record.quantities.billedChicken, quantidade_codorna: record.quantities.billedQuail,
    fstd_process: { finalizada_em: record.finalizedAt },
    status: 'Finalizada', status_nfd: 'finalizada',
  }
}

function PhotoLightbox({ photo, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])
  if (!photo) return null
  return <div className="attached-photo-lightbox" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><button className="attached-photo-lightbox__close" type="button" onClick={onClose} aria-label="Fechar foto">×</button><img src={photo.url} alt="Foto enviada pelo promotor" /></div>
}

function AttachedPhotoCard({ record, onOpenFstd, onOpenPhoto, priority = false }) {
  const [activePhoto, setActivePhoto] = useState(0)
  const hasMultiplePhotos = record.photos.length > 1
  const photo = record.photos[activePhoto]

  function preloadNextPhoto() {
    if (!hasMultiplePhotos) return

    const nextPhoto = record.photos[(activePhoto + 1) % record.photos.length]
    if (!nextPhoto?.url) return

    const image = new Image()
    image.src = nextPhoto.url
  }

  function showPhoto(event, direction) {
    event.stopPropagation()
    setActivePhoto((current) => (current + direction + record.photos.length) % record.photos.length)
  }

  return (
    <article className="attached-photo-card" onClick={() => onOpenFstd(record)} onKeyDown={(event) => { if (event.key === 'Enter') onOpenFstd(record) }} tabIndex="0">
      <div className="attached-photo-card__media">
        <img src={photo.url} alt={`Foto enviada para a NFD ${record.nfdNumber}`} decoding="async" fetchPriority={priority ? 'high' : 'auto'} loading={priority ? 'eager' : 'lazy'} onLoad={preloadNextPhoto} onClick={(event) => { event.stopPropagation(); onOpenPhoto(photo) }} />
        {hasMultiplePhotos && <><span className="attached-photo-card__count">{activePhoto + 1} / {record.photos.length}</span><button className="attached-photo-card__nav attached-photo-card__nav--previous" type="button" onClick={(event) => showPhoto(event, -1)} aria-label="Mostrar foto anterior">‹</button><button className="attached-photo-card__nav attached-photo-card__nav--next" type="button" onClick={(event) => showPhoto(event, 1)} aria-label="Mostrar próxima foto">›</button></>}
      </div>
      <div className="attached-photo-card__body">
        <h2>{record.storeName}</h2>
        <p className="attached-photo-card__nfd"><span>NFD</span><strong>{record.nfdNumber}</strong></p>
        <div className="attached-photo-card__products"><span>Produtos</span><div className="attached-photo-card__product-chips">{record.products.map((product) => <span key={product}>{product}</span>)}</div></div>
        <footer className="attached-photo-card__footer"><span>Enviado por {record.promoterName}</span><time dateTime={record.sentAt}>{formatSentAt(record.sentAt)}</time></footer>
      </div>
    </article>
  )
}

function AttachedPhotosSkeleton() {
  return <div className="attached-photos-grid" aria-label="Carregando fotos anexadas">{Array.from({ length: 6 }, (_, index) => <div className="attached-photo-skeleton" key={index} aria-hidden="true"><div className="attached-photo-skeleton__image" /><div className="attached-photo-skeleton__line attached-photo-skeleton__line--title" /><div className="attached-photo-skeleton__line" /><div className="attached-photo-skeleton__line attached-photo-skeleton__line--short" /></div>)}</div>
}

export function AttachedPhotosScreen({ canEditFinalized = false }) {
  const [records, setRecords] = useState([])
  const [query, setQuery] = useState('')
  const [sortOrder, setSortOrder] = useState('recent')
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [pageLoading, setPageLoading] = useState(false)
  const [hydratedPageRecords, setHydratedPageRecords] = useState([])
  const [error, setError] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [selectedFinalized, setSelectedFinalized] = useState(null)
  const [selectedFstd, setSelectedFstd] = useState(null)
  const hydratedPagesCache = useRef(new Map())

  useEffect(() => {
    let mounted = true
    async function loadRecords() {
      setLoading(true); setError('')
      try { const data = await listAttachedPhotoNfds(); if (mounted) setRecords(data) } catch (requestError) { if (mounted) setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar as fotos anexadas.') } finally { if (mounted) setLoading(false) }
    }
    void loadRecords()
    return () => { mounted = false }
  }, [])

  const visibleRecords = useMemo(() => {
    const normalizedQuery = normalize(query)
    const filtered = normalizedQuery ? records.filter((record) => normalize([record.nfdNumber, record.storeName, ...record.products].join(' ')).includes(normalizedQuery)) : records
    return [...filtered].sort((left, right) => (sortOrder === 'recent' ? 1 : -1) * (new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime()))
  }, [query, records, sortOrder])
  const totalPages = Math.max(1, Math.ceil(visibleRecords.length / CARDS_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageRecords = useMemo(
    () => visibleRecords.slice((safeCurrentPage - 1) * CARDS_PER_PAGE, safeCurrentPage * CARDS_PER_PAGE),
    [safeCurrentPage, visibleRecords],
  )

  useEffect(() => {
    let mounted = true
    const pageCacheKey = pageRecords.map((record) => record.id).join('|')

    async function loadPagePhotos() {
      const cachedPage = hydratedPagesCache.current.get(pageCacheKey)
      if (cachedPage && cachedPage.expiresAt > Date.now()) {
        setHydratedPageRecords(cachedPage.records)
        setPageLoading(false)
        return
      }

      setPageLoading(true)
      try {
        const data = await hydrateAttachedPhotoRecords(pageRecords)
        if (mounted) {
          hydratedPagesCache.current.set(pageCacheKey, { records: data, expiresAt: Date.now() + HYDRATED_PAGE_CACHE_TTL_MS })
          setHydratedPageRecords(data)
        }
      } catch (requestError) {
        if (mounted) setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar as fotos da página.')
      } finally {
        if (mounted) setPageLoading(false)
      }
    }

    if (pageRecords.length) void loadPagePhotos()

    return () => { mounted = false }
  }, [pageRecords])

  function openFstd(record) {
    if (!record.store) return
    setSelectedFinalized({ note: buildFinalizedNote(record), store: record.store })
  }
  function editFinalizedFstd(note, store) {
    if (!canEditFinalized) return
    setSelectedFinalized(null)
    setSelectedFstd({ note: { ...note, status: 'Finalizada', status_nfd: 'finalizada' }, store, allowFinalizedEdit: true })
  }

  return (
    <section className="attached-photos-page">
      <div className="attached-photos-toolbar"><SearchField label="Procurar fotos anexadas" value={query} onChange={(value) => { setQuery(value); setCurrentPage(1) }} placeholder="Procurar por NFD, loja ou produto..." /><label className="attached-photos-sort"><span>Ordenar por:</span><AppSelect value={sortOrder} onChange={(event) => { setSortOrder(event.target.value); setCurrentPage(1) }} options={[{ value: 'recent', label: 'Mais recentes' }, { value: 'oldest', label: 'Mais antigas' }]} /></label></div>
      {loading || pageLoading ? <AttachedPhotosSkeleton /> : error ? <div className="attached-photos-state attached-photos-state--error" role="alert">{error}</div> : records.length === 0 ? <div className="attached-photos-state"><strong>Nenhuma foto encontrada</strong><p>As fotos enviadas pelos promotores aparecerão aqui.</p></div> : visibleRecords.length === 0 ? <div className="attached-photos-state"><strong>Nenhum resultado encontrado para sua pesquisa.</strong></div> : <><div className="attached-photos-grid">{hydratedPageRecords.map((record, index) => <AttachedPhotoCard key={record.id} record={record} priority={index < 8} onOpenFstd={openFstd} onOpenPhoto={setSelectedPhoto} />)}</div><footer className="attached-photos-pagination"><span>{(safeCurrentPage - 1) * CARDS_PER_PAGE + 1}–{Math.min(safeCurrentPage * CARDS_PER_PAGE, visibleRecords.length)} de {visibleRecords.length}</span><Pagination currentPage={safeCurrentPage} totalPages={totalPages} label="Paginação de fotos anexadas" onPageChange={setCurrentPage} /></footer></>}
      {selectedPhoto && <PhotoLightbox photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />}
      <GerencialFinalizedNfdModal note={selectedFinalized?.note} store={selectedFinalized?.store} onClose={() => setSelectedFinalized(null)} onEdit={canEditFinalized ? editFinalizedFstd : undefined} />
      <GerencialFstdModal note={selectedFstd?.note} store={selectedFstd?.store} allowFinalizedEdit={selectedFstd?.allowFinalizedEdit} onClose={() => setSelectedFstd(null)} onCompleted={() => setSelectedFstd(null)} />
    </section>
  )
}
