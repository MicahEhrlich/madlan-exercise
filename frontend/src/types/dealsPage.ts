import type { PropertyDeal } from './propertyDeal'

export interface DealsPage {
  page: number
  count: number
  total: number
  total_pages: number
  rows: PropertyDeal[]
}
