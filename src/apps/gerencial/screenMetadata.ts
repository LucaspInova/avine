import type { GerencialScreenId } from './navigation'

export const gerencialNavItems: ReadonlyArray<{
  id: GerencialScreenId
  label: string
  icon: string
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'chart' },
  { id: 'notas', label: 'Notas', icon: 'notes' },
  { id: 'fotos-anexadas', label: 'Fotos', icon: 'camera' },
  { id: 'usuarios', label: 'Usuários', icon: 'user-plus' },
  { id: 'lojas', label: 'Lojas', icon: 'pin' },
]

const screenMetadata: Record<GerencialScreenId, {
  title: string
  subtitle: string
  icon: string
}> = {
  dashboard: {
    title: 'Dashboard Geral',
    subtitle: 'Visão geral da operação de devoluções e retornos.',
    icon: 'chart',
  },
  notas: {
    title: 'Notas Fiscais de Devolução',
    subtitle: 'Preenchimento de FSTD logística ou lojas sem promotor.',
    icon: 'notes',
  },
  'fotos-anexadas': {
    title: 'Fotos Anexadas',
    subtitle: 'Fotos enviadas pelos promotores referentes às suas devoluções',
    icon: 'camera',
  },
  usuarios: {
    title: 'Usuários',
    subtitle: 'Gerencie todos os usuários do sistema.',
    icon: 'user-plus',
  },
  lojas: {
    title: 'Lojas',
    subtitle: 'Roteirização dos promotores.',
    icon: 'pin',
  },
  perfil: {
    title: 'Perfil',
    subtitle: 'Dados da conta.',
    icon: 'users',
  },
  motivos: {
    title: 'Motivos',
    subtitle: 'Cadastro de motivos de devolução.',
    icon: 'notes',
  },
  recolhimento: {
    title: 'Recolhimento',
    subtitle: 'Fila logística de recolhimentos.',
    icon: 'logs',
  },
  relatorios: {
    title: 'Relatório',
    subtitle: 'Relatório Solicitante BI.',
    icon: 'chart',
  },
}

export function getGerencialScreenMetadata(screen: GerencialScreenId, profileLabel = '') {
  const metadata = screenMetadata[screen]
  if (screen !== 'perfil' || !profileLabel) return metadata
  return { ...metadata, subtitle: `Dados da conta ${profileLabel}.` }
}

