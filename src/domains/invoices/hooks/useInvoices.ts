import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { findInvoiceStore, listInvoicesOverview, markInvoiceUnknown, recognizeInvoice, startInvoiceProcess } from '../invoicesRepository'

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (filters: unknown) => ['invoices', filters] as const,
}

export function useInvoices(filters: { restrictedUfs: string[] }) {
  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: () => listInvoicesOverview(filters.restrictedUfs),
  })
}

export function useInvoiceMutations() {
  const client = useQueryClient()
  const invalidate = () => client.invalidateQueries({ queryKey: invoiceKeys.all })
  return {
    start: useMutation({ mutationFn: ({ storeId, accessKey }: any) => startInvoiceProcess(storeId, accessKey), onSuccess: invalidate }),
    findStore: useMutation({ mutationFn: ({ code, restrictedUfs }: any) => findInvoiceStore(code, restrictedUfs) }),
    markUnknown: useMutation({ mutationFn: ({ store, note, comment }: any) => markInvoiceUnknown(store, note, comment), onSuccess: invalidate }),
    recognize: useMutation({ mutationFn: (note: any) => recognizeInvoice(note), onSuccess: invalidate }),
  }
}
