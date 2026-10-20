import type { LocationOptions } from '../types/locationOptions'
import type { PropertyDeal } from '../types/propertyDeal'
import type { DealFilters } from './filterDeals'

export function locationFilterOptions(deals: PropertyDeal[], filters: DealFilters, catalog?: LocationOptions) {
  const appendSelection = (options: string[], selected?: string) => [...new Set([...options, ...(selected ? [selected] : [])])]
  const selectedCity = catalog?.scope.city === (filters.city || null) ? catalog.selected_city ?? filters.city : filters.city
  const cityReady = Boolean(filters.city?.trim()) && (!catalog || catalog.scope.city === filters.city)
  const streetReady = cityReady && (!catalog || catalog.scope.neighborhood === (filters.neighborhood || null))
  return {
    city: { options: appendSelection(catalog?.cities ?? deals.map((row) => row.city), selectedCity), value: selectedCity ?? '', disabled: false },
    neighborhood: { options: appendSelection(cityReady ? catalog?.neighborhoods ?? deals.map((row) => row.neighborhood) : [], filters.neighborhood), disabled: !cityReady },
    street: { options: appendSelection(streetReady ? catalog?.streets ?? deals.map((row) => row.street) : [], filters.street), disabled: !streetReady },
  }
}
