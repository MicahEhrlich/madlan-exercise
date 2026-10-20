import type { PropertyDeal } from '../types/propertyDeal'
import { fetchDealAnalysis } from '../api/fetchDealAnalysis'
import { canAnalyzeDeal } from '../utils/canAnalyzeDeal'
import { useApiQuery } from './useApiQuery'

export function useDealAnalysis(deal: PropertyDeal) {
  return useApiQuery({
    queryKey: ['deal-analysis', import.meta.env.VITE_API_BASE_URL ?? '', deal.row_id, deal],
    request: (signal, onProcessing) => fetchDealAnalysis(deal.row_id, signal, onProcessing),
    enabled: canAnalyzeDeal(deal),
    staleTime: (query) => query.state.data && !('status' in query.state.data) ? 300000 : 0,
    errorMessage: 'לא ניתן לטעון את ניתוח העסקה. נסו שוב.',
    timeoutMessage: 'ניתוח העסקה ארך זמן רב מדי. נסו שוב.',
  })
}
