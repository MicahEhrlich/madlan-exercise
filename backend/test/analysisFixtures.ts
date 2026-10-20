import { inspectDeal } from '../src/deals/validateDeal.js'
import type { SavedDeal } from '../src/deals/types.js'
import type { AnalysisRequest, AnalysisResponse } from '../src/analysis/transport.js'
import { validRow } from './fixtures.js'

export function savedDeal(recordNumber = 2, changes: Partial<SavedDeal> = {}): SavedDeal {
  return { ...inspectDeal(validRow).deal, row_id: `row-${recordNumber}`, deal_id: `D${recordNumber}`,
    row_status: 'original', fixed_fields: [], ...changes }
}
export const comparableDeals = () => [savedDeal(), ...[3, 4, 5].map((id) => savedDeal(id))]
export function supportedAnalysis({ comparisons, evidence }: Pick<AnalysisRequest, 'comparisons' | 'evidence'>) {
  return { valuation_assessment: comparisons.assessment, estimated_discount_premium_pct: comparisons.percentage,
    key_strengths: evidence.strengths.slice(0, 3), risk_factors: evidence.risks.slice(0, 3) }
}
export async function successfulAnalysis(request: AnalysisRequest): Promise<AnalysisResponse> {
  return { text: JSON.stringify(supportedAnalysis(request)), stopReason: 'end_turn', usage: { input_tokens: 100, output_tokens: 60 } }
}
