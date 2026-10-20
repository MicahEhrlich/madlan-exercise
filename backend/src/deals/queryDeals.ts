import { z } from 'zod'
import type { DealCollection } from './types.js'
import { matchesDealSearch } from './searchDeals.js'

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
  floor: z.union([z.literal('unknown'), integer]).optional(),
  total_floors: integer.optional(),
  year_built: z.union([z.literal('unknown'), integer.pipe(z.number().positive())]).optional(),
  condition: text.optional(),
  has_elevator: boolean.optional(),
  has_parking: boolean.optional(),
  has_balcony: boolean.optional(),
  has_safe_room: boolean.optional(),
  deal_date: z.iso.date().optional(),
  price_nis: positive.optional(),
  price_per_sqm: positive.optional(),
  source: text.optional(),
  row_status: z.enum(['original', 'fixed']).optional(),
  q: z.string().trim().optional(),
  page: pageNumber.default(1),
  count: pageNumber.pipe(z.number().max(100)).default(20),
})

export type DealsQuery = z.infer<typeof dealsQuerySchema>

export function queryDeals(deals: DealCollection, query: DealsQuery) {
  const { page, count, q = '', ...filters } = query
  const matches = deals.filter((deal) =>
    Object.entries(filters).every(([key, value]) => deal[key as keyof typeof filters] === value) && matchesDealSearch(deal, q),
  )
  const offset = (page - 1) * count
  return {
    page,
    count,
    total: matches.length,
    total_pages: Math.ceil(matches.length / count),
    rows: matches.slice(offset, offset + count),
  }
}
