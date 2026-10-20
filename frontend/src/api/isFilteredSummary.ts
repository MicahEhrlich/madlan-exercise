import type { FilteredSummary } from '../types/filteredSummary'

export function isFilteredSummary(value: unknown, total: number): value is FilteredSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const summary = value as Record<string, unknown>
  const average = summary.average_price_per_sqm
  if (total === 0) return average === null && summary.city_comparison === null
  if (typeof average !== 'number' || !Number.isFinite(average) || average <= 0) return false
  if (summary.city_comparison === null) return true
  if (!summary.city_comparison || typeof summary.city_comparison !== 'object') return false
  const comparison = summary.city_comparison as Record<string, unknown>
  const baseline = comparison.average_price_per_sqm
  return typeof comparison.city === 'string' && comparison.city.trim().length > 0 &&
    typeof baseline === 'number' && Number.isFinite(baseline) && baseline > 0 &&
    typeof comparison.difference_pct === 'number' && Number.isFinite(comparison.difference_pct) &&
    comparison.difference_pct === Number(((average / baseline - 1) * 100).toFixed(1))
}
