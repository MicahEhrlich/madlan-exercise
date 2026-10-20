import { fetchDeals } from '../api/fetchDeals'
import { useApiQuery } from './useApiQuery'
import type { DealFilters } from '../utils/filterDeals'

export function useDeals(page: number, count: number, filters: DealFilters, query: string) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ''))
  if (query.trim()) params.set('q', query.trim())
  params.sort()
  const filterQuery = params.toString()
  return useApiQuery({
    queryKey: ['deals', import.meta.env.VITE_API_BASE_URL ?? '', page, count, filterQuery],
    request: (signal, onProcessing) => fetchDeals(page, count, signal, filterQuery, onProcessing),
    keepPrevious: true,
    errorMessage: 'לא ניתן לטעון את העסקאות. נסו שוב.',
    timeoutMessage: 'טעינת העסקאות ארכה זמן רב מדי. נסו שוב.',
  })
}
