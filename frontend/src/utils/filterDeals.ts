import { columns } from '../data/dealColumns'
import type { PropertyDeal } from '../types/propertyDeal'
import { formatValue } from './formatValue'

export type DealFilters = Partial<Record<keyof PropertyDeal, string>>

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
    return matchesFilters && matchesSearch
  })
}
