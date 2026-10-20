import { dealHeaders } from '../deals/types.js'
import { dealKey } from '../deals/dealKey.js'
import type { Deal, RawDeal } from '../deals/types.js'
import { repairReportSchema } from './schema.js'
import { isVerifiedRepair } from './repairEvidence.js'
export { isVerifiedRepair } from './repairEvidence.js'
import type { RepairCandidate, RepairReport } from './types.js'
import type { VerifiedLookupFact } from './lookupEvidence.js'


/** Reject broken accounting/membership for the whole response; vet each proposal independently. */
export function verifyRepairReport(text: string, candidates: readonly RepairCandidate[], facts: readonly VerifiedLookupFact[] = []): RepairReport {
  const parsed = repairReportSchema.parse(JSON.parse(text))
  if (parsed.auto_corrected !== parsed.auto_corrected_rows.length ||
    parsed.rows_failed_to_correct !== parsed.failed_rows.length ||
    parsed.auto_corrected + parsed.rows_failed_to_correct !== candidates.length) {
    throw new Error('Repair response counts do not match submitted rows')
  }
  const remaining = new Map(candidates.map((candidate) => [dealKey(candidate.original), candidate]))
  if (remaining.size !== candidates.length) throw new Error('Ambiguous submitted deal identities')
  const corrected: Deal[] = []
  const failed: RawDeal[] = []
  const returnedIdentities = new Set<string>()
  for (const proposed of parsed.auto_corrected_rows) {
    const key = dealKey(proposed)
    if (returnedIdentities.has(key)) throw new Error('Duplicate repair result')
    returnedIdentities.add(key)
    // An unambiguous ID fallback lets field verification reject altered addresses.
    // With multiple addresses for one ID, exact identity matching is required.
    const matches = [...remaining.values()].filter((row) => row.original.deal_id.trim() === proposed.deal_id)
    const original = remaining.get(dealKey(proposed)) ?? (matches.length === 1 ? matches[0] : undefined)
    if (!original) throw new Error('Unknown, ambiguous, or duplicate repair result')
    remaining.delete(dealKey(original.original))
    if (isVerifiedRepair(original, proposed, facts)) corrected.push(proposed)
    else failed.push(original.original)
  }
  for (const row of parsed.failed_rows) {
    const original = remaining.get(dealKey(row as RawDeal))
    if (!original || !dealHeaders.every((key) => row[key] === original.original[key])) {
      throw new Error('Failed row is not an unchanged submitted row')
    }
    remaining.delete(dealKey(row as RawDeal))
    failed.push(original.original)
  }
  return { auto_corrected: corrected.length, rows_failed_to_correct: failed.length, auto_corrected_rows: corrected, failed_rows: failed }
}
