import { dealHeaders } from './types.js'
import type { Deal, RawDeal } from './types.js'
import { inspectDeal } from './validateDeal.js'

/** Compare with ordinary parsing, so representation normalization is not a repair. */
export function fixedFields(original: RawDeal, saved: Deal): readonly (keyof Deal)[] {
  const inspected = inspectDeal(original)
  const invalid = new Set(inspected.reasons.map((reason) => reason.split(':')[0]))
  // Invalid boolean tokens parse to false as a placeholder. They still require a
  // repair even when the final verified/default value also happens to be false.
  return Object.freeze(dealHeaders.filter((field) => invalid.has(field) || inspected.deal[field] !== saved[field]))
}
