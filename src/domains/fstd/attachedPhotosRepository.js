import { paginateSupabase } from '../../shared/api/pagination'
import { toAppError } from '../../shared/errors'
import { supabase } from '../../shared/lib/supabaseClient'
import { listStores } from '../stores'
import { listManagedUsers } from '../users'

const PHOTO_BUCKET = 'fstd-fotos'
const SIGNED_URL_TTL_SECONDS = 60 * 60
const SIGNED_URL_CACHE_BUFFER_MS = 60 * 1000
const signedUrlCache = new Map()

function asPhotoPaths(value) {
  if (!Array.isArray(value)) return []

  return value
    .filter((path) => typeof path === 'string' && path.trim())
    .map((path) => path.trim())
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

async function getSignedUrls(bucket, paths, errorMessage) {
  const now = Date.now()
  const urls = new Map()
  const pathsToSign = []

  for (const path of unique(paths)) {
    const cached = signedUrlCache.get(path)
    if (cached && cached.expiresAt > now + SIGNED_URL_CACHE_BUFFER_MS) {
      urls.set(path, cached.url)
    } else {
      pathsToSign.push(path)
    }
  }

  if (!pathsToSign.length) return urls

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(pathsToSign, SIGNED_URL_TTL_SECONDS)

  if (error) throw toAppError(error, errorMessage)

  const expiresAt = now + SIGNED_URL_TTL_SECONDS * 1000
  const signedUrlsByPath = new Map(data.map((item) => [item.path, item.signedUrl]))

  for (const path of pathsToSign) {
    const url = signedUrlsByPath.get(path)
    if (!url) throw new Error(errorMessage)

    signedUrlCache.set(path, { url, expiresAt })
    urls.set(path, url)
  }

  return urls
}

function getQuantitySummary(products) {
  return products.reduce((summary, product) => {
    const billedChicken = Number(product.quantidade_faturada_galinha ?? 0)
    const billedQuail = Number(product.quantidade_faturada_codorna ?? 0)
    const returned = Math.max(0, Number(product.quantidade_retorno ?? 0))
    const billedTotal = billedChicken + billedQuail

    summary.billedChicken += billedChicken
    summary.billedQuail += billedQuail

    if (billedTotal > 0) {
      summary.returnedChicken += returned * billedChicken / billedTotal
      summary.returnedQuail += returned * billedQuail / billedTotal
    }

    return summary
  }, { billedChicken: 0, billedQuail: 0, returnedChicken: 0, returnedQuail: 0 })
}

export function buildAttachedPhotoNfds({ processes, products, stores, users, signedUrls = new Map() }) {
  const storesById = new Map((stores ?? []).map((store) => [store.id, store]))
  const usersById = new Map((users ?? []).map((user) => [user.id, user]))
  const productsByProcess = new Map()

  for (const product of products ?? []) {
    const photoPaths = asPhotoPaths(product.fotos)
    const group = productsByProcess.get(product.processo_id) ?? []
    group.push({ ...product, photoPaths })
    productsByProcess.set(product.processo_id, group)
  }

  return (processes ?? [])
    .map((process) => {
      const processProducts = productsByProcess.get(process.id) ?? []
      const productsWithPhotos = processProducts.filter((product) => product.photoPaths.length > 0)
      const photos = unique(productsWithPhotos.flatMap((product) => product.photoPaths))
        .map((path) => ({ path, url: signedUrls.get(path) ?? '' }))

      if (!photos.length) return null

      const sentAt = productsWithPhotos
        .map((product) => product.concluido_em ?? product.updated_at ?? product.created_at)
        .filter(Boolean)
        .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0]
        ?? process.updated_at
        ?? process.finalizada_em
        ?? process.created_at
      const store = storesById.get(process.loja_id)
      const quantities = getQuantitySummary(processProducts)

      return {
        id: process.id,
        nfdNumber: String(process.nfd_numero ?? ''),
        accessKey: String(process.nfd_chave_acesso ?? ''),
        issueDate: process.nfd_data_emissao ?? null,
        store: store ?? null,
        storeName: store?.nome ?? 'Loja não identificada',
        promoterName: usersById.get(process.promotor_id)?.nome ?? 'Promotor não identificado',
        products: unique(processProducts.map((product) => product.nome?.trim())),
        photos,
        sentAt,
        finalizedAt: process.finalizada_em ?? sentAt,
        quantities,
      }
    })
    .filter(Boolean)
    .sort((left, right) => new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime())
}

export async function hydrateAttachedPhotoRecords(records) {
  const photoPaths = unique((records ?? []).flatMap((record) => record.photos.map((photo) => photo.path)))
  const signedUrls = await getSignedUrls(PHOTO_BUCKET, photoPaths, 'Não foi possível carregar as fotos enviadas.')

  return (records ?? []).map((record) => ({
    ...record,
    photos: record.photos.map((photo) => ({ ...photo, url: signedUrls.get(photo.path) ?? '' })),
  }))
}

export async function listAttachedPhotoNfds() {
  try {
    const [processes, products, stores, users] = await Promise.all([
      paginateSupabase((from, to) => supabase
        .from('fstd_processos')
        .select('id, nfd_chave_acesso, nfd_numero, nfd_data_emissao, loja_id, promotor_id, finalizada_em, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .range(from, to)),
      paginateSupabase((from, to) => supabase
        .from('fstd_produtos')
        .select('processo_id, nome, fotos, quantidade_faturada_galinha, quantidade_faturada_codorna, quantidade_retorno, concluido_em, created_at, updated_at')
        .range(from, to)),
      listStores(),
      listManagedUsers(),
    ])

    return buildAttachedPhotoNfds({ processes, products, stores, users })
  } catch (error) {
    throw toAppError(error, 'Não foi possível carregar as fotos anexadas.')
  }
}
