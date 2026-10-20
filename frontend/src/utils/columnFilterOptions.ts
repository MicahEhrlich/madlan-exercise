import type { FilterOptions } from '../types/filterOptions'
import type { PropertyDeal, PropertyDealValues } from '../types/propertyDeal'
import type { DealFilters } from './filterDeals'
import { formatValue } from './formatValue'

export function columnFilterOptions(field: keyof PropertyDealValues, deals: PropertyDeal[], filters: DealFilters, catalog?: FilterOptions): string[] {
  if (field.startsWith('has_')) return ['true', 'false']
  const options = ((field === 'property_type' || field === 'condition' || field === 'source') && catalog
    ? catalog[field] : undefined) ?? deals.map((row) => String(row[field]))
  return [...new Set([...options, ...(filters[field] ? [filters[field]] : [])])]
}

export function formatColumnFilterOption(field: keyof PropertyDealValues, value: string, deals: PropertyDeal[]): string {
  if (field.startsWith('has_')) return value === 'true' ? 'כן' : 'לא'
  return String(formatValue(deals.find((row) => String(row[field]) === value)?.[field] ?? value, field))
}
