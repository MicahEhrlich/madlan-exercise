import { z } from 'zod'
import type { DealCollection } from './types.js'
import { matchesDealSearch } from './searchDeals.js'
import { neighborhoodDiscounts } from './neighborhoodDiscounts.js'
import { filteredSummary } from './filteredSummary.js'

const text = z.string().trim().min(1)
const numeric = z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number).pipe(z.number().finite())
const positive = numeric.pipe(z.number().positive())
const integer = numeric.pipe(z.number().int().nonnegative())
const boolean = z.enum(['true', 'false']).transform((value) => value === 'true')
const pageNumber = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive())

/** Parse query strings explicitly: notably, the string "false" must stay false. */
export const dealsQuerySchema = z.strictObject({
  city: text.optional(),
  neighborhood: text.optional(),
  street: text.optional(),
  property_type: text.optional(),
  rooms: positive.optional(),
  size_sqm: positive.optional(),
  size_sqm_min: numeric.optional(),
  size_sqm_max: numeric.optional(),
  floor: z.union([z.literal('unknown'), integer]).optional(),
  total_floors: integer.optional(),
  year_built: z.union([z.literal('unknown'), integer.pipe(z.number().positive())]).optional(),
  year_built_min: integer.pipe(z.number().positive()).optional(),
  below_neighborhood_average: boolean.optional(),
  condition: text.optional(),
  has_elevator: boolean.optional(),
  has_parking: boolean.optional(),
  has_balcony: boolean.optional(),
  has_safe_room: boolean.optional(),
  deal_date: z.iso.date().optional(),
  price_nis: positive.optional(),
  price_nis_min: numeric.optional(),
  price_nis_max: numeric.optional(),
  price_per_sqm: positive.optional(),
  price_per_sqm_min: numeric.optional(),
  price_per_sqm_max: numeric.optional(),
  source: text.optional(),
  row_status: z.enum(['original', 'fixed']).optional(),
  q: z.string().trim().optional(),
  page: pageNumber.default(1),
  count: pageNumber.pipe(z.number().max(100)).default(20),
})

export type DealsQuery = z.infer<typeof dealsQuerySchema>

export function queryDeals(deals: DealCollection, query: DealsQuery, neighborhoodDiscountIds?: ReadonlySet<string>) {
  const { page, count, q = '', size_sqm_min, size_sqm_max, price_nis_min, price_nis_max,
    price_per_sqm_min, price_per_sqm_max, year_built_min, below_neighborhood_average, ...filters } = query
  const discountIds = below_neighborhood_average ? neighborhoodDiscountIds ?? neighborhoodDiscounts(deals) : undefined
  const ranges = [
    ['size_sqm', size_sqm_min, size_sqm_max],
    ['price_nis', price_nis_min, price_nis_max],
    ['price_per_sqm', price_per_sqm_min, price_per_sqm_max],
  ] as const
  const matches = deals.filter((deal) =>
    (year_built_min === undefined || (typeof deal.year_built === 'number' && deal.year_built >= year_built_min)) &&
    (!discountIds || discountIds.has(deal.row_id)) &&
    Object.entries(filters).every(([key, value]) => deal[key as keyof typeof filters] === value) &&
    ranges.every(([key, min, max]) => (min === undefined || deal[key] >= min) && (max === undefined || deal[key] <= max)) &&
    matchesDealSearch(deal, q),
  )
  const offset = (page - 1) * count
  return {
    page,
    count,
    total: matches.length,
    total_pages: Math.ceil(matches.length / count),
    filtered_summary: filteredSummary(matches, deals),
    rows: matches.slice(offset, offset + count),
  }
}
