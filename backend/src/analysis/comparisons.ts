import type { DealCollection, SavedDeal } from '../deals/types.js'
import { cityName } from '../deals/cityName.js'

export type ComparisonScope = 'street' | 'neighborhood' | 'city'
export interface ComparisonGroup {
  scope: ComparisonScope
  count: number
  average_price_per_sqm: number
  first_deal_date: string
  last_deal_date: string
}

export function knownLocation(value: string | undefined): boolean {
  const text = value?.trim()
  return Boolean(text && text.toLowerCase() !== 'unknown')
}

export function eligibleForAnalysis(deal: Pick<SavedDeal, 'street' | 'neighborhood'>): boolean {
  return knownLocation(deal.street) || knownLocation(deal.neighborhood)
}

export function valuation(percentage: number) {
  return percentage < -5 ? 'Undervalued' as const : percentage > 5 ? 'Overpriced' as const : 'Fairly Priced' as const
}

export function buildComparisons(target: Readonly<SavedDeal>, deals: DealCollection) {
  const city = deals.filter((row) => row.row_id !== target.row_id &&
    cityName(row.city) === cityName(target.city) && row.property_type === target.property_type)
  const groups: ComparisonGroup[] = []
  for (const scope of ['street', 'neighborhood', 'city'] as const) {
    if (scope !== 'city' && !knownLocation(target[scope])) continue
    const rows = scope === 'city' ? city : city.filter((row) => row[scope] === target[scope])
    if (!rows.length) continue
    // Dividing before summation avoids overflow of an otherwise finite mean.
    const average = rows.reduce((sum, row) => sum + row.price_per_sqm / rows.length, 0)
    if (!Number.isFinite(average) || average <= 0) continue
    const dates = rows.map((row) => row.deal_date).sort()
    groups.push({ scope, count: rows.length, average_price_per_sqm: average,
      first_deal_date: dates[0]!, last_deal_date: dates[dates.length - 1]! })
  }
  const baseline = groups.find((group) => group.count >= 3)
  if (!baseline) return undefined
  const percentage = Number(((target.price_per_sqm / baseline.average_price_per_sqm - 1) * 100).toFixed(2))
  if (!Number.isFinite(percentage)) return undefined
  return { groups, baseline, percentage, assessment: valuation(percentage) }
}

export type Comparisons = NonNullable<ReturnType<typeof buildComparisons>>
