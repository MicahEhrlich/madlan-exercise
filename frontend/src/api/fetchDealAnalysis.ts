import type { DealAnalysisResult } from '../types/dealAnalysis'
import { fetchWhenReady } from './fetchWhenReady'

export function isDealAnalysisResult(value: unknown): value is DealAnalysisResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  if ('status' in result) return Object.keys(result).length === 1 && result.status === 'unavailable'
  const fields = ['valuation_assessment', 'estimated_discount_premium_pct', 'key_strengths', 'risk_factors']
  if (Object.keys(result).length !== fields.length || !fields.every((field) => field in result)) return false
  const percentage = result.estimated_discount_premium_pct
  if (typeof percentage !== 'number' || !Number.isFinite(percentage) || percentage < -100) return false
  const assessment = percentage < -5 ? 'Undervalued' : percentage > 5 ? 'Overpriced' : 'Fairly Priced'
  if (result.valuation_assessment !== assessment) return false
  return ['key_strengths', 'risk_factors'].every((field) => {
    const statements = result[field]
    return Array.isArray(statements) && statements.length <= 8 &&
      (field !== 'risk_factors' || statements.length > 0) &&
      statements.every((statement: unknown) => typeof statement === 'string' && statement.trim().length > 0 && statement.length <= 1000) &&
      new Set(statements).size === statements.length
  })
}

export async function fetchDealAnalysis(rowId: string, signal: AbortSignal, onProcessing: () => void): Promise<DealAnalysisResult> {
  const response = await fetchWhenReady(`/deals/${encodeURIComponent(rowId)}/analysis`, signal, onProcessing)
  if (!response.ok) throw new Error('לא ניתן לטעון את ניתוח העסקה.')
  const data: unknown = await response.json()
  if (!isDealAnalysisResult(data)) throw new Error('התקבל ניתוח עסקה שאינו תקין.')
  return data
}
