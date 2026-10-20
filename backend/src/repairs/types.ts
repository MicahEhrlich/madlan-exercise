import type { Deal, RawDeal } from '../deals/types.js'
import type { VerifiedLookupFact } from './lookupEvidence.js'

export interface RepairCandidate {
  recordNumber: number
  original: RawDeal
  prepared: RawDeal
  rawFields: readonly string[]
  reasons: string[]
}
export interface RepairReport {
  auto_corrected: number
  rows_failed_to_correct: number
  auto_corrected_rows: Deal[]
  failed_rows: RawDeal[]
}
export interface RepairRequest {
  model: string
  candidates: readonly RepairCandidate[]
  signal: AbortSignal
}
export interface RepairResponse {
  text: string
  facts?: VerifiedLookupFact[]
  stopReason: string | null
  usage: { input_tokens: number; output_tokens: number; web_search_requests?: number }
}
export type RepairTransport = (request: RepairRequest) => Promise<RepairResponse>
export const defaultAnthropicModel = 'claude-haiku-4-5-20251001'
export const defaultLlmBatchSize = 5
export const maxOutputTokens = 2048
