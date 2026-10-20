import type { PropertyDeal } from './propertyDeal'
import type { FilteredSummary } from './filteredSummary'
import type { LocationOptions } from './locationOptions'

export interface DealsPage {
  page: number
  count: number
  total: number
  total_pages: number
  rows: PropertyDeal[]
  /** Optional for compatibility with servers predating filtered summaries. */
  filtered_summary?: FilteredSummary
  location_options?: LocationOptions
}
