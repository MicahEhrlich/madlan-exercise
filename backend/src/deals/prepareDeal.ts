import { inspectDeal, validateDeal } from './validateDeal.js'
import type { RawDeal } from './types.js'

export interface CodeCorrection {
  field: keyof RawDeal
  original: string
  corrected: string
  kind: 'derived' | 'default'
}

/** Repair only derivable financial values and explicitly configured missing-value defaults. */
export function prepareDeal(original: RawDeal) {
  const { deal } = inspectDeal(original)
  let raw = original
  const corrections: CodeCorrection[] = []
  const set = (field: keyof RawDeal, value: string, kind: CodeCorrection['kind']) => {
    corrections.push({ field, original: original[field], corrected: value, kind })
    raw = { ...raw, [field]: value }
  }
  const positive = (value: number) => Number.isFinite(value) && value > 0
  const derive = (field: keyof RawDeal, value: number) => {
    if (positive(value)) {
      // Keep very small/large derived values parseable by the decimal-only validator.
      set(field, value.toLocaleString('en-US', { useGrouping: false, maximumSignificantDigits: 21 }), 'derived')
    }
  }
  const price = positive(deal.price_nis)
  const unitPrice = positive(deal.price_per_sqm)
  const size = positive(deal.size_sqm)
  if (!price && unitPrice && size) derive('price_nis', deal.price_per_sqm * deal.size_sqm)
  else if (!size && price && unitPrice) derive('size_sqm', deal.price_nis / deal.price_per_sqm)
  else if (price && size && (!unitPrice || Math.abs(deal.price_nis / deal.size_sqm - deal.price_per_sqm) > 1)) {
    derive('price_per_sqm', deal.price_nis / deal.size_sqm)
  }

  if (!original.condition.trim()) set('condition', 'unknown', 'default')
  if (!original.floor.trim()) set('floor', 'unknown', 'default')
  if (!original.has_parking.trim()) set('has_parking', 'false', 'default')
  return { raw, result: validateDeal(raw), corrected: corrections.length > 0, corrections }
}
