import { useMutation, useQuery, type QueryKey, type UseMutationOptions } from '@tanstack/react-query'
import type { FstdRepository } from '../api/fstdRepository'
import type { FinalizeFstdRpcResponse, SaveFstdProductCommand, SaveFstdProductRpcResponse } from '../model/types'

/** React Query orchestration; transactional rules remain in repository RPCs. */
export function useFstdLoad<T>(queryKey: QueryKey, load: () => Promise<T>, enabled = true) {
  return useQuery({ queryKey, queryFn: load, enabled })
}

export function useFstdSave(
  repository: FstdRepository,
  options: Omit<UseMutationOptions<SaveFstdProductRpcResponse, Error, SaveFstdProductCommand>, 'mutationFn'> = {},
) {
  return useMutation({ mutationFn: (command) => repository.saveProduct(command), ...options })
}

export function useFstdFinalize(
  repository: FstdRepository,
  options: Omit<UseMutationOptions<FinalizeFstdRpcResponse, Error, string>, 'mutationFn'> = {},
) {
  return useMutation({ mutationFn: (processId) => repository.finalize(processId), ...options })
}
