import { z } from 'zod'
import type { DealCollection } from './types.js'

export const filteredSummarySchema = z.strictObject({
  average_price_per_sqm: z.number().finite().positive().nullable(),
  city_comparison: z.strictObject({
    city: z.string().trim().min(1),
    average_price_per_sqm: z.number().finite().positive(),
    difference_pct: z.number().finite(),
  }).nullable(),
}).refine((summary) => !summary.city_comparison || (summary.average_price_per_sqm !== null &&
  summary.city_comparison.difference_pct === priceDifferencePct(summary.average_price_per_sqm, summary.city_comparison.average_price_per_sqm)))

export type FilteredSummary = z.infer<typeof filteredSummarySchema>

export function priceDifferencePct(average: number, baseline: number): number {
  return Number(((average / baseline - 1) * 100).toFixed(1))
}

function meanPrice(rows: DealCollection): number {
  let mean = rows[0]!.price_per_sqm
  for (let index = 1; index < rows.length; index++) mean += (rows[index]!.price_per_sqm - mean) / (index + 1)
  return mean
}

/** Descriptive averages over accepted data, independent of page and page size. */
export function filteredSummary(matches: DealCollection, allDeals: DealCollection): FilteredSummary {
  if (!matches.length) return { average_price_per_sqm: null, city_comparison: null }
  const average = meanPrice(matches)
  const city = matches[0]!.city
  if (matches.some((row) => row.city !== city)) return { average_price_per_sqm: average, city_comparison: null }
  const baseline = meanPrice(allDeals.filter((row) => row.city === city))
  return { average_price_per_sqm: average, city_comparison: {
    city, average_price_per_sqm: baseline, difference_pct: priceDifferencePct(average, baseline),
  } }
}
