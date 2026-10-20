import { expect, it, vi } from 'vitest'
import { createFilterOptions } from '../src/deals/filterOptions.js'
import { queryDeals, dealsQuerySchema } from '../src/deals/queryDeals.js'
import { createCachedDealsQuery } from '../src/cache/cachedDeals.js'
import { parseCachedResponse } from '../src/cache/cachedResponse.js'
import { savedDeal } from './analysisFixtures.js'
import { fakeCache } from './cacheFixtures.js'

const rows = [
  savedDeal(2, { property_type: 'דירה', condition: 'חדש', source: 'רשות המסים' }),
  savedDeal(3, { property_type: 'בית', condition: 'לשיפוץ', city: 'ירושלים', source: 'מדלן' }),
  savedDeal(4, { property_type: 'דירה', condition: 'unknown' }),
]

it('returns distinct property types and conditions from the complete accepted dataset', () => {
  const options = createFilterOptions([...rows, rows[0]!])
  expect(options.property_type).toEqual(['בית', 'דירה'])
  expect(new Set(options.condition)).toEqual(new Set(['חדש', 'לשיפוץ', 'unknown']))
  expect(options.condition).toHaveLength(3)
  expect(options.source).toEqual(['מדלן', 'רשות המסים'])
  expect(createFilterOptions([])).toEqual({ property_type: [], condition: [], source: [] })
})

it('keeps choices independent of their selection, location, search, pagination, and empty results', () => {
  const allOptions = createFilterOptions(rows)
  const query = dealsQuerySchema.parse({ property_type: 'דירה', condition: 'חדש', source: 'רשות המסים', count: '1', city: 'חיפה' })
  expect(queryDeals(rows, query).rows).toEqual([rows[0]])
  expect(queryDeals(rows, query).filter_options).toEqual(allOptions)
  expect(queryDeals(rows, { ...query, q: 'לא קיים', page: 99 }).filter_options).toEqual(allOptions)
})

it('caches complete choices and rejects outdated or malformed cached option catalogs', async () => {
  const { cache } = fakeCache()
  const run = createCachedDealsQuery(rows, cache, { warn: vi.fn() })
  const query = dealsQuerySchema.parse({ property_type: 'דירה', condition: 'חדש' })
  const result = await run(query)
  expect((await run(query)).filter_options).toEqual(createFilterOptions(rows))
  expect(cache.set).toHaveBeenCalledTimes(1)
  for (const filter_options of [undefined, {}, { ...result.filter_options, property_type: ['דירה', 'דירה'] },
    { ...result.filter_options, condition: [''] }, { ...result.filter_options, source: ['מדלן', 'מדלן'] }]) {
    expect(parseCachedResponse(JSON.stringify({ ...result, filter_options }), query, rows.length)).toBeUndefined()
  }
})
