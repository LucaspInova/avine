export const gerencialScreenIds = [
  'dashboard',
  'notas',
  'fotos-anexadas',
  'usuarios',
  'lojas',
  'produtos',
  'perfil',
  'motivos',
  'recolhimento',
  'relatorios',
] as const

export type GerencialScreenId = (typeof gerencialScreenIds)[number]

const segmentByScreen: Record<GerencialScreenId, string> = {
  dashboard: 'dashboard',
  notas: 'notas',
  'fotos-anexadas': 'fotos',
  usuarios: 'usuarios',
  lojas: 'lojas',
  produtos: 'produtos',
  perfil: 'perfil',
  motivos: 'motivos',
  recolhimento: 'recolhimento',
  relatorios: 'relatorios',
}

const screenBySegment = new Map<string, GerencialScreenId>(
  Object.entries(segmentByScreen).map(([screen, segment]) => [segment, screen as GerencialScreenId]),
)

// Compatibilidade temporaria com o unico endereco profundo que existia antes
// da arvore canonica. O primeiro acesso o normaliza para /fotos.
screenBySegment.set('fotos-anexadas', 'fotos-anexadas')

export function getGerencialBasePath(pathname: string, profile?: string | null) {
  const firstSegment = pathname.split('/').filter(Boolean)[0]
  if (firstSegment === 'admin' || firstSegment === 'gerencial') return `/${firstSegment}`
  return profile === 'Admin' ? '/admin' : '/gerencial'
}

export function getGerencialScreenFromPath(pathname: string): GerencialScreenId | null {
  const [, screenSegment] = pathname.split('/').filter(Boolean)
  if (!screenSegment) return 'dashboard'
  return screenBySegment.get(screenSegment) ?? null
}

export function getGerencialScreenPath(
  pathname: string,
  profile: string | null | undefined,
  screen: GerencialScreenId,
) {
  return `${getGerencialBasePath(pathname, profile)}/${segmentByScreen[screen]}`
}

export function isCanonicalGerencialPath(pathname: string, screen: GerencialScreenId) {
  const basePath = getGerencialBasePath(pathname)
  return pathname.replace(/\/+$/, '') === `${basePath}/${segmentByScreen[screen]}`
}

export function getGerencialSearch(search: string) {
  return new URLSearchParams(search).get('q') ?? ''
}

export function setGerencialSearch(pathname: string, search: string, value: string) {
  const query = new URLSearchParams(search)
  if (value) query.set('q', value)
  else query.delete('q')
  const suffix = query.toString()
  return `${pathname}${suffix ? `?${suffix}` : ''}`
}
