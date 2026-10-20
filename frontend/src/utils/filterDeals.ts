import { columns } from '../data/dealColumns'
import type { PropertyDeal, PropertyDealValues } from '../types/propertyDeal'
import { formatValue } from './formatValue'

export const rangeFields = ['size_sqm', 'price_nis', 'price_per_sqm'] as const
export type RangeField = typeof rangeFields[number]
export type FilterKey = keyof PropertyDealValues | `${RangeField}_${'min' | 'max'}`
export type DealFilters = Partial<Record<FilterKey, string>>

export function hasInvalidRanges(filters: DealFilters): boolean {
  return rangeFields.some((key) => {
    const min = filters[`${key}_min`] ?? ''
    const max = filters[`${key}_max`] ?? ''
    return [min, max].some((value) => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) ||
      (min !== '' && max !== '' && Number(min) > Number(max))
  })
}

export function filterDeals(deals: PropertyDeal[], query: string, filters: DealFilters): PropertyDeal[] {
  const search = query.trim().toLocaleLowerCase('he-IL')

  return deals.filter((deal) => {
    const matchesFilters = columns.every(([key]) => {
      const filter = filters[key]
      return !filter || String(deal[key]) === filter
    })
    const matchesSearch = !search || columns.some(([key]) =>
      `${deal[key]} ${formatValue(deal[key], key)}`.toLocaleLowerCase('he-IL').includes(search),
    )
    const matchesRanges = rangeFields.every((key) => {
      const min = filters[`${key}_min`]
      const max = filters[`${key}_max`]
      return (!min || deal[key] >= Number(min)) && (!max || deal[key] <= Number(max))
    })
    return matchesFilters && matchesSearch && matchesRanges
  })
}
