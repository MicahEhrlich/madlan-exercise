import { z } from 'zod'
import type { DealCollection } from './types.js'
import { cityName } from './cityName.js'

const names = z.array(z.string().trim().min(1)).refine((values) => new Set(values).size === values.length)
export const locationOptionsSchema = z.strictObject({
  scope: z.strictObject({ city: z.string().min(1).nullable(), neighborhood: z.string().min(1).nullable() }),
  selected_city: z.string().min(1).nullable(),
  cities: names,
  neighborhoods: names,
  streets: names,
})
export type LocationOptions = z.infer<typeof locationOptionsSchema>
type LocationScope = { city?: string; neighborhood?: string }

/** Keep accepted rows as the catalog; current table results never shrink it. */
export function createLocationOptions(deals: DealCollection) {
  const distinct = (values: string[]) => [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b, 'he'))
  const cities = distinct(deals.map((row) => cityName(row.city)))
  return ({ city, neighborhood }: LocationScope): LocationOptions => {
    const cityRows = city ? deals.filter((row) => cityName(row.city) === cityName(city)) : deals
    const streetRows = neighborhood ? cityRows.filter((row) => row.neighborhood === neighborhood) : cityRows
    return { scope: { city: city ?? null, neighborhood: neighborhood ?? null }, selected_city: city ? cityName(city) : null, cities,
      neighborhoods: distinct(cityRows.map((row) => row.neighborhood)),
      streets: distinct(streetRows.map((row) => row.street)) }
  }
}
