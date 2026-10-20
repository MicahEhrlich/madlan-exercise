import { z } from 'zod'
import type { DealCollection } from './types.js'

const names = z.array(z.string().trim().min(1)).refine((values) => new Set(values).size === values.length)
export const filterOptionsSchema = z.strictObject({ property_type: names, condition: names, source: names })
export type FilterOptions = z.infer<typeof filterOptionsSchema>

/** All accepted values, independent of the current selection and result page. */
export function createFilterOptions(deals: DealCollection): FilterOptions {
  const distinct = (field: 'property_type' | 'condition' | 'source') => [...new Set(deals.map((row) => row[field]))]
    .sort((left, right) => left.localeCompare(right, 'he'))
  return { property_type: distinct('property_type'), condition: distinct('condition'), source: distinct('source') }
}
