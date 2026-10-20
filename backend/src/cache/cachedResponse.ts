import { z } from 'zod'
import { dealSchema } from '../repairs/schema.js'
import { dealHeaders } from '../deals/types.js'
import type { RawDeal } from '../deals/types.js'
import { validateDeal } from '../deals/validateDeal.js'
import { queryDeals } from '../deals/queryDeals.js'
import type { DealsQuery } from '../deals/queryDeals.js'
import { rowIdSchema } from '../deals/rowId.js'
import { filteredSummarySchema } from '../deals/filteredSummary.js'

const savedDealSchema = dealSchema.extend({
  row_id: rowIdSchema,
  row_status: z.enum(['original', 'fixed']),
  fixed_fields: z.array(z.enum(dealHeaders)),
}).refine((row) => {
  if (new Set(row.fixed_fields).size !== row.fixed_fields.length ||
    (row.row_status === 'fixed') !== (row.fixed_fields.length > 0)) return false
  const raw = Object.fromEntries(dealHeaders.map((key) => {
    const value = row[key]
    // Ordinary CSV validation expects decimal text, including very small values.
    const text = typeof value === 'number'
      ? value.toLocaleString('en-US', { useGrouping: false, maximumSignificantDigits: 21 })
      : String(value)
    return [key, text]
  })) as RawDeal
  return validateDeal(raw).reasons.length === 0
})

const responseSchema = z.strictObject({
  page: z.number().int().positive(),
  count: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  total_pages: z.number().int().nonnegative(),
  rows: z.array(savedDealSchema),
  filtered_summary: filteredSummarySchema,
})

/** Treat invalid JSON, pagination, row values, or repair metadata as a miss. */
export function parseCachedResponse(text: string, query: DealsQuery, datasetSize: number, neighborhoodDiscountIds?: ReadonlySet<string>) {
  try {
    if (query.below_neighborhood_average && !neighborhoodDiscountIds) return undefined
    const parsed = responseSchema.safeParse(JSON.parse(text))
    if (!parsed.success) return undefined
    const result = parsed.data
    const expectedRows = Math.max(0, Math.min(query.count, result.total - (query.page - 1) * query.count))
    const summary = result.filtered_summary
    if ((result.total === 0) !== (summary.average_price_per_sqm === null) ||
      (summary.city_comparison && (summary.city_comparison.city !== (query.city ?? summary.city_comparison.city) ||
        result.rows.some((row) => row.city !== summary.city_comparison!.city)))) return undefined
    if (result.page !== query.page || result.count !== query.count || result.total > datasetSize ||
      result.total_pages !== Math.ceil(result.total / query.count) || result.rows.length !== expectedRows ||
      queryDeals(result.rows, { ...query, page: 1 }, neighborhoodDiscountIds).total !== result.rows.length) return undefined
    return result
  } catch {
    return undefined
  }
}
