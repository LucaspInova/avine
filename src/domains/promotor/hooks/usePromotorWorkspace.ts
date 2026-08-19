import { useQuery } from '@tanstack/react-query'
import { listFstdProcesses, listFstdProcessesForNfd, listProductCatalog, listPromotorInvoices, listPromotorStores, listReturnReasons, listUnknownInvoices } from '../api/promotorRepository'

type PromotorWorkspaceOptions = {
  fstdAccessKey?: string | null
}

export function usePromotorWorkspace(profile: any, options: PromotorWorkspaceOptions = {}) {
  const scope = { profileId: profile.id }
  const fstdAccessKey = String(options.fstdAccessKey ?? '').trim()
  const isFocusedFstd = Boolean(fstdAccessKey)
  const stores = useQuery({ enabled: !isFocusedFstd, queryKey: ['stores', scope], queryFn: listPromotorStores })
  const invoices = useQuery({ enabled: !isFocusedFstd && Boolean(stores.data?.length), queryKey: ['invoices', scope], queryFn: () => listPromotorInvoices(stores.data ?? []) })
  const catalog = useQuery({ queryKey: ['products', 'active'], queryFn: listProductCatalog })
  const processes = useQuery({
    queryKey: ['fstd-process', scope, isFocusedFstd ? fstdAccessKey : 'all'],
    queryFn: () => isFocusedFstd ? listFstdProcessesForNfd(fstdAccessKey) : listFstdProcesses(),
  })
  const unknown = useQuery({ enabled: !isFocusedFstd, queryKey: ['invoices', { ...scope, status: 'unknown' }], queryFn: () => listUnknownInvoices(profile) })
  const reasons = useQuery({ queryKey: ['return-reasons', 'active'], queryFn: listReturnReasons })
  return { stores, invoices, catalog, processes, unknown, reasons }
}
