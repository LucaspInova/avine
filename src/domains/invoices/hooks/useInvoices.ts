import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { findInvoiceStore, listInvoicesOverview, markInvoiceUnknown, recognizeInvoice, startInvoiceProcess } from '../invoicesRepository'
import type { FindInvoiceStoreCommand, MarkInvoiceUnknownCommand, RecognizeInvoiceCommand, StartInvoiceProcessCommand } from '../types'

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (filters: unknown) => ['invoices', filters] as const,
}

export function useInvoices(filters: { restrictedUfs: string[]; startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: () => listInvoicesOverview(filters.restrictedUfs, filters.startDate, filters.endDate),
  })
}

export function useInvoiceMutations() {
  const client = useQueryClient()
  const invalidate = () => client.invalidateQueries({ queryKey: invoiceKeys.all })
  return {
    start: useMutation({ mutationFn: ({ storeId, accessKey }: StartInvoiceProcessCommand) => startInvoiceProcess(storeId, accessKey), onSuccess: invalidate }),
    findStore: useMutation({ mutationFn: ({ code, restrictedUfs }: FindInvoiceStoreCommand) => findInvoiceStore(code, restrictedUfs) }),
    markUnknown: useMutation({ mutationFn: ({ store, note, comment }: MarkInvoiceUnknownCommand) => markInvoiceUnknown(store, note, comment), onSuccess: invalidate }),
    recognize: useMutation({ mutationFn: (note: RecognizeInvoiceCommand) => recognizeInvoice(note), onSuccess: invalidate }),
  }
}
