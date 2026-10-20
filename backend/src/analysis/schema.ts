import { z } from 'zod'
import type { Comparisons } from './comparisons.js'
import type { AnalysisEvidence } from './evidence.js'

export const analysisSchema = z.strictObject({
  valuation_assessment: z.enum(['Undervalued', 'Fairly Priced', 'Overpriced']),
  estimated_discount_premium_pct: z.number().finite(),
  key_strengths: z.array(z.string().min(1).max(1000)).max(8),
  risk_factors: z.array(z.string().min(1).max(1000)).min(1).max(8),
})
export const cachedAnalysisSchema = z.strictObject({
  expires_at: z.number().int().positive().safe(),
  analysis: analysisSchema,
})
export type DealAnalysis = Readonly<Omit<z.infer<typeof analysisSchema>, 'key_strengths' | 'risk_factors'> & {
  key_strengths: readonly string[]
  risk_factors: readonly string[]
}>
export const analysisUnavailable = Object.freeze({ status: 'unavailable' as const })
export type AnalysisResult = DealAnalysis | typeof analysisUnavailable

/** Recheck cached and model results against the current dataset and policy alike. */
export function verifyAnalysis(text: string, comparisons: Comparisons, evidence: AnalysisEvidence): DealAnalysis {
  const parsed = analysisSchema.parse(JSON.parse(text))
  if (parsed.valuation_assessment !== comparisons.assessment ||
    parsed.estimated_discount_premium_pct !== comparisons.percentage ||
    !parsed.key_strengths.every((statement) => evidence.strengths.includes(statement)) ||
    !parsed.risk_factors.every((statement) => evidence.risks.includes(statement)) ||
    new Set(parsed.key_strengths).size !== parsed.key_strengths.length ||
    new Set(parsed.risk_factors).size !== parsed.risk_factors.length ||
    !parsed.risk_factors.includes(evidence.risks[0]!)) {
    throw new Error('Analysis is not supported by supplied evidence')
  }
  return Object.freeze({ ...parsed, key_strengths: Object.freeze(parsed.key_strengths),
    risk_factors: Object.freeze(parsed.risk_factors) })
}
