import { fetchImportSummary } from '../api/fetchImportSummary'
import { useApiQuery } from './useApiQuery'

export function useImportSummary() {
  return useApiQuery({
    queryKey: ['import-summary', import.meta.env.VITE_API_BASE_URL ?? ''],
    request: fetchImportSummary,
    staleTime: Infinity,
    errorMessage: 'לא ניתן לטעון את סיכום קליטת הנתונים. נסו שוב.',
  })
}
