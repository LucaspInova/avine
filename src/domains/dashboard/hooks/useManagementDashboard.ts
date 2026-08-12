import { useQuery } from '@tanstack/react-query'
import { loadManagementDashboard } from '../dashboardRepository'
import type { ManagementDashboardFilters } from '../types'

export const managementDashboardKeys = {
  all: ['management-dashboard'] as const,
  detail: (filters: ManagementDashboardFilters) => [...managementDashboardKeys.all, filters] as const,
}

export function useManagementDashboard(filters: ManagementDashboardFilters) {
  return useQuery({
    queryKey: managementDashboardKeys.detail(filters),
    queryFn: ({ signal }) => loadManagementDashboard(filters, signal),
  })
}
