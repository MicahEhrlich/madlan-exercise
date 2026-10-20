export type ValuationAssessment = 'Undervalued' | 'Fairly Priced' | 'Overpriced'

export interface DealAnalysis {
  valuation_assessment: ValuationAssessment
  estimated_discount_premium_pct: number
  key_strengths: string[]
  risk_factors: string[]
}

export type DealAnalysisResult = DealAnalysis | { status: 'unavailable' }
