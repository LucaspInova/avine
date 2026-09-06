import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { findInvoiceStore, listInvoiceUnknownHistory, listInvoicesOverview, markInvoiceUnknown, recognizeInvoice, startInvoiceProcess } from '../invoicesRepository'
import type { FindInvoiceStoreCommand, InvoiceListFilters, MarkInvoiceUnknownCommand, RecognizeInvoiceCommand, StartInvoiceProcessCommand } from '../types'

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (filters: unknown) => ['invoices', filters] as const,
  unknownHistory: (storeId: string, invoiceNumber: string) => ['invoices', 'unknown-history', storeId, invoiceNumber] as const,
}

export function useInvoiceUnknownHistory(storeId?: string | null, invoiceNumber?: string | number | null) {
  const safeStoreId = String(storeId ?? '')
  const safeInvoiceNumber = String(invoiceNumber ?? '')
  return useQuery({
    enabled: Boolean(safeStoreId && safeInvoiceNumber),
    queryKey: invoiceKeys.unknownHistory(safeStoreId, safeInvoiceNumber),
    queryFn: () => listInvoiceUnknownHistory(safeStoreId, safeInvoiceNumber),
    staleTime: 30_000,
    retry: false,
  })
}

export function useInvoices(filters: InvoiceListFilters) {
  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: ({ signal }) => listInvoicesOverview(filters, signal),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

export function useInvoiceMutations() {
  const client = useQueryClient()
  const invalidate = () => client.invalidateQueries({ queryKey: invoiceKeys.all })
  const invalidateStartedProcess = () => Promise.all([
    invalidate(),
    client.invalidateQueries({ queryKey: ['fstd-process'] }),
  ])
  return {
    start: useMutation({ mutationFn: ({ storeId, accessKey }: StartInvoiceProcessCommand) => startInvoiceProcess(storeId, accessKey), onSuccess: invalidateStartedProcess }),
    findStore: useMutation({ mutationFn: ({ code, restrictedUfs }: FindInvoiceStoreCommand) => findInvoiceStore(code, restrictedUfs) }),
    markUnknown: useMutation({ mutationFn: ({ store, note, comment, commentType }: MarkInvoiceUnknownCommand) => markInvoiceUnknown(store, note, comment, commentType), onSuccess: invalidate }),
    recognize: useMutation({ mutationFn: (note: RecognizeInvoiceCommand) => recognizeInvoice(note), onSuccess: invalidate }),
  }
}
