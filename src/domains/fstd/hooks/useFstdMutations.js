import { useMutation, useQuery } from '@tanstack/react-query'

/** React Query orchestration; transactional rules remain in repository RPCs. */
export function useFstdLoad(queryKey, load, enabled = true) {
  return useQuery({ queryKey, queryFn: load, enabled })
}

export function useFstdSave(repository, options = {}) {
  return useMutation({ mutationFn: ({ rpcName, args }) => repository.saveProduct(rpcName, args), ...options })
}

export function useFstdFinalize(repository, options = {}) {
  return useMutation({ mutationFn: (processId) => repository.finalize(processId), ...options })
}
