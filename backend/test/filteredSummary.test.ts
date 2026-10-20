import { expect, it, vi } from 'vitest'
import { filteredSummary } from '../src/deals/filteredSummary.js'
import { queryDeals, dealsQuerySchema } from '../src/deals/queryDeals.js'
import { createCachedDealsQuery } from '../src/cache/cachedDeals.js'
import { parseCachedResponse } from '../src/cache/cachedResponse.js'
import { fakeCache } from './cacheFixtures.js'
import { savedDeal } from './analysisFixtures.js'

const rows = [
  savedDeal(2, { rooms: 4, size_sqm: 50, price_per_sqm: 30000, price_nis: 1500000 }),
  savedDeal(3, { rooms: 4, size_sqm: 200, price_per_sqm: 50000, price_nis: 10000000 }),
  savedDeal(4, { rooms: 3, price_per_sqm: 70000, price_nis: 7000000 }),
  savedDeal(5, { city: 'ירושלים', rooms: 3, price_per_sqm: 100000, price_nis: 10000000 }),
]
const summary = { average_price_per_sqm: 40000,
  city_comparison: { city: 'חיפה', average_price_per_sqm: 50000, difference_pct: -20 } }

it('calculates an unweighted mean over all filtered rows and an unfiltered city baseline', () => {
  const result = queryDeals(rows, dealsQuerySchema.parse({ rooms: '4', count: '1' }))
  expect(result.total).toBe(2)
  expect(result.rows).toEqual([rows[0]])
  expect(result.filtered_summary).toEqual(summary)
  for (const params of [{ page: '2', count: '1' }, { page: '99', count: '1' }, { page: '1', count: '100' }]) {
    expect(queryDeals(rows, dealsQuerySchema.parse({ rooms: '4', ...params })).filtered_summary).toEqual(summary)
  }
})

it('handles multiple cities, no results, an inferred single city, and a zero difference', () => {
  expect(filteredSummary(rows, rows)).toEqual({ average_price_per_sqm: 62500, city_comparison: null })
  expect(filteredSummary([], rows)).toEqual({ average_price_per_sqm: null, city_comparison: null })
  expect(filteredSummary(rows.slice(0, 3), rows)).toEqual({ average_price_per_sqm: 50000,
    city_comparison: { city: 'חיפה', average_price_per_sqm: 50000, difference_pct: 0 } })
})

it('supports search, presets, signed differences, and keeps the city baseline unchanged', () => {
  const lower = queryDeals(rows, dealsQuerySchema.parse({ q: 'חיפה', price_per_sqm_max: '30000' })).filtered_summary
  const upper = queryDeals(rows, dealsQuerySchema.parse({ city: 'חיפה', price_per_sqm_min: '70000' })).filtered_summary
  expect(lower).toEqual({ average_price_per_sqm: 30000,
    city_comparison: { city: 'חיפה', average_price_per_sqm: 50000, difference_pct: -40 } })
  expect(upper).toEqual({ average_price_per_sqm: 70000,
    city_comparison: { city: 'חיפה', average_price_per_sqm: 50000, difference_pct: 40 } })
  expect(queryDeals(rows, dealsQuerySchema.parse({ year_built_min: '2020' })).filtered_summary.average_price_per_sqm).toBeNull()
})

it('returns the same filtered summary on Redis hits, and rejects corrupt or obsolete cached summaries', async () => {
  const { cache } = fakeCache()
  const query = dealsQuerySchema.parse({ rooms: '4', count: '1' })
  const cached = createCachedDealsQuery(rows, cache, { warn: vi.fn() })
  const response = await cached(query)
  expect((await cached(query)).filtered_summary).toEqual(summary)
  expect(cache.set).toHaveBeenCalledTimes(1)
  for (const bad of [
    undefined, { average_price_per_sqm: -1, city_comparison: null },
    { ...summary, city_comparison: { ...summary.city_comparison, difference_pct: 99 } },
    { ...summary, city_comparison: { ...summary.city_comparison, city: 'ירושלים' } },
    { average_price_per_sqm: null, city_comparison: null },
    { ...summary, average_price_per_sqm: null },
  ]) {
    expect(parseCachedResponse(JSON.stringify({ ...response, filtered_summary: bad }), query, rows.length)).toBeUndefined()
  }
  const empty = queryDeals(rows, dealsQuerySchema.parse({ rooms: '99' }))
  expect(parseCachedResponse(JSON.stringify({ ...empty, filtered_summary: summary }), dealsQuerySchema.parse({ rooms: '99' }), rows.length)).toBeUndefined()
})
