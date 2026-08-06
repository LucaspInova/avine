import { useQuery } from '@tanstack/react-query'
import { listFstdProcesses, listProductCatalog, listPromotorInvoices, listPromotorStores, listReturnReasons, listUnknownInvoices } from '../api/promotorRepository'

export function usePromotorWorkspace(profile: any) {
  const scope = { profileId: profile.id }
  const stores = useQuery({ queryKey: ['stores', scope], queryFn: listPromotorStores })
  const invoices = useQuery({ enabled: Boolean(stores.data?.length), queryKey: ['invoices', scope], queryFn: () => listPromotorInvoices(stores.data ?? []) })
  const catalog = useQuery({ queryKey: ['products', 'active'], queryFn: listProductCatalog })
  const processes = useQuery({ queryKey: ['fstd-process', scope], queryFn: listFstdProcesses })
  const unknown = useQuery({ queryKey: ['invoices', { ...scope, status: 'unknown' }], queryFn: () => listUnknownInvoices(profile) })
  const reasons = useQuery({ queryKey: ['return-reasons', 'active'], queryFn: listReturnReasons })
  return { stores, invoices, catalog, processes, unknown, reasons }
}
