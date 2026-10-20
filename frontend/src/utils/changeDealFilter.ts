import type { DealFilters, FilterKey } from './filterDeals'

/** A new parent location invalidates its previous descendants in the same update. */
export function changeDealFilter(current: DealFilters, key: FilterKey, value: string): DealFilters {
  const next = { ...current, [key]: value }
  if (current[key] !== value) {
    if (key === 'city') { delete next.neighborhood; delete next.street }
    else if (key === 'neighborhood') delete next.street
  }
  if (key === 'year_built') delete next.year_built_min
  return next
}
