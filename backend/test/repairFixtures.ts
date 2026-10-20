import { dealHeaders } from '../src/deals/types.js'
import type { Deal, RawDeal } from '../src/deals/types.js'
import { prepareDeal } from '../src/deals/prepareDeal.js'
import { inspectDeal } from '../src/deals/validateDeal.js'
import type { RepairCandidate, RepairResponse, RepairReport } from '../src/repairs/types.js'
import { validRow } from './fixtures.js'

export function candidate(changes: Partial<RawDeal> = {}, recordNumber = 2): RepairCandidate {
  const original = { ...validRow, has_parking: 'יש', ...changes }
  const prepared = prepareDeal(original)
  return { recordNumber, original, prepared: prepared.raw,
    rawFields: dealHeaders.map((key) => original[key]), reasons: prepared.result.reasons }
}
export function proposed(row: RepairCandidate, changes: Partial<Deal> = {}): Deal {
  return { ...inspectDeal(row.prepared).deal, has_parking: true, ...changes }
}
export function report(rows: Deal[] = [], failed: RawDeal[] = []): RepairReport {
  return { auto_corrected: rows.length, rows_failed_to_correct: failed.length, auto_corrected_rows: rows, failed_rows: failed }
}
export function response(value: unknown, stopReason = 'end_turn'): RepairResponse {
  return { text: typeof value === 'string' ? value : JSON.stringify(value), stopReason, usage: { input_tokens: 100, output_tokens: 50 } }
}
