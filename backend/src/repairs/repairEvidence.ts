import type { Deal, RawDeal } from '../deals/types.js'
import { inspectDeal, validateDeal } from '../deals/validateDeal.js'
import { prepareDeal } from '../deals/prepareDeal.js'
import { dateRepairEvidence } from './dateEvidence.js'
import { dealHeaders } from '../deals/types.js'
import type { RepairCandidate } from './types.js'
import type { VerifiedLookupFact } from './lookupEvidence.js'
import { dealKey } from '../deals/dealKey.js'

export function representationEvidence(key: keyof Deal, value: string): number | boolean | string | undefined {
  const text = value.trim()
  if (key === 'deal_date') return dateRepairEvidence(text)?.date
  if (key.startsWith('has_')) {
    if (text === 'יש') return true
    if (text === 'אין') return false
  }
  const suffix = key === 'rooms' ? '(?:חדר|rooms?)' :
    key === 'size_sqm' ? '(?:sqm|מ[״"]ר|m²)' :
    key === 'price_nis' || key === 'price_per_sqm' ? '(?:NIS|ש[״"]ח|₪)' : undefined
  if (!suffix) return undefined
  const match = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${suffix}$`, 'i').exec(text)
  return match ? Number(match[1]) : undefined
}


export function isVerifiedRepair(candidate: Pick<RepairCandidate, 'prepared'>, proposed: Deal, facts: readonly VerifiedLookupFact[] = []): boolean {
  const inspected = inspectDeal(candidate.prepared)
  const invalidFields = new Set(inspected.reasons.map((reason) => reason.split(':')[0]))
  const financialFields = ['price_nis', 'price_per_sqm', 'size_sqm'] as const
  const unverifiedFinancial: typeof financialFields[number][] = []
  for (const key of dealHeaders) {
    if (!invalidFields.has(key)) {
      if (proposed[key] !== inspected.deal[key]) return false
    } else {
      if ((key === 'year_built' || key === 'neighborhood') && !candidate.prepared[key].trim() && proposed[key] === 'unknown') continue
      const sourceFact = facts.find((fact) => fact.identity === dealKey(candidate.prepared) && fact.field === key)
      const evidence = representationEvidence(key, candidate.prepared[key]) ?? sourceFact?.value
      if (evidence !== undefined) {
        if (proposed[key] !== evidence) return false
      } else if (key === 'price_nis' || key === 'price_per_sqm' || key === 'size_sqm') {
        unverifiedFinancial.push(key)
      } else return false
    }
  }
  if (unverifiedFinancial.length > 1) return false
  if (unverifiedFinancial.length === 1) {
    const key = unverifiedFinancial[0]!
    const expected = key === 'price_nis' ? proposed.price_per_sqm * proposed.size_sqm :
      key === 'size_sqm' ? proposed.price_nis / proposed.price_per_sqm : proposed.price_nis / proposed.size_sqm
    if (!Number.isFinite(expected) || expected <= 0 || Math.abs(proposed[key] - expected) > 0.000001) return false
  }
  const raw = Object.fromEntries(dealHeaders.map((key) => [key, String(proposed[key])])) as RawDeal
  return validateDeal(raw).reasons.length === 0
}

/** Reject requests that cannot possibly pass the same evidence checks as a response. */
export function canAttemptRepair(prepared: RawDeal, allowLookup = false): boolean {
  const { reasons } = inspectDeal(prepared)
  const fields = new Set(reasons.map((reason) => reason.split(':')[0] as keyof Deal))
  const suggested = { ...prepared }
  const lookupPlaceholders: VerifiedLookupFact[] = []
  for (const field of fields) {
    const evidence = representationEvidence(field, prepared[field])
    if (evidence !== undefined) suggested[field] = String(evidence)
    else if (allowLookup && (field === 'year_built' || field === 'neighborhood') && !prepared[field].trim()) {
      // Preflight only: placeholders are never persisted or sent as facts.
      const value = field === 'year_built' ? 2000 : '__source_lookup__'
      suggested[field] = String(value)
      lookupPlaceholders.push({ identity: dealKey(prepared), field, value, url: '', quote: '' })
    }
  }
  // A single remaining financial error may become derivable after a format repair.
  // Missing property facts and insufficient financial operands still fail validation.
  const result = prepareDeal(suggested).result
  return 'deal' in result && isVerifiedRepair({ prepared }, result.deal, lookupPlaceholders)
}
