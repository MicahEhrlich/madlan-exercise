import type { DealCollection, SavedDeal } from './types.js'

/** Benchmarks always use the full accepted dataset, before search and pagination. */
export function neighborhoodDiscounts(deals: DealCollection): ReadonlySet<string> {
  const groups = new Map<string, Readonly<SavedDeal>[]>()
  for (const deal of deals) {
    if (!deal.neighborhood.trim() || deal.neighborhood.trim().toLowerCase() === 'unknown') continue
    const key = JSON.stringify([deal.city, deal.neighborhood, deal.property_type])
    const group = groups.get(key)
    if (group) group.push(deal)
    else groups.set(key, [deal])
  }
  const discounted = new Set<string>()
  for (const group of groups.values()) {
    if (group.length < 4) continue
    let mean = group[0]!.price_per_sqm
    for (let index = 1; index < group.length; index++) mean += (group[index]!.price_per_sqm - mean) / (index + 1)
    // Below the inclusive mean is equivalent to below the other rows' mean.
    if (!Number.isFinite(mean) || mean <= 0) continue
    for (const deal of group) if (deal.price_per_sqm < mean) discounted.add(deal.row_id)
  }
  return discounted
}
