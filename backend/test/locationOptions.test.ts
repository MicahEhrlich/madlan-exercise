import { rm } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { createLocationOptions } from '../src/deals/locationOptions.js'
import { queryDeals, dealsQuerySchema } from '../src/deals/queryDeals.js'
import { parseCachedResponse } from '../src/cache/cachedResponse.js'
import { createCachedDealsQuery } from '../src/cache/cachedDeals.js'
import { buildApp } from '../src/app.js'
import { savedDeal } from './analysisFixtures.js'
import { fakeCache } from './cacheFixtures.js'
import { fixture, csv } from './fixtures.js'

const locations = [
  { city: 'חיפה', neighborhood: 'הדר', street: 'הרצל' },
  { city: 'חיפה', neighborhood: 'הדר', street: 'בלפור' },
  { city: 'חיפה', neighborhood: 'כרמל', street: 'חורב' },
  { city: 'תל אביב', neighborhood: 'מרכז', street: 'דיזנגוף' },
  { city: 'תל אביב', neighborhood: 'מרכז', street: 'בן יהודה' },
]
const rows = locations.map((location, i) => savedDeal(i + 2, location))
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true }))) })

it('keeps cities global, neighborhoods scoped only to city, and streets scoped only to parent locations', () => {
  const options = createLocationOptions(rows)
  const all = options({})
  expect(all.cities).toEqual(['חיפה', 'תל אביב-יפו'])
  expect(all.neighborhoods).toEqual(['הדר', 'כרמל', 'מרכז'])
  expect(all.streets).toHaveLength(5)
  expect(options({ city: 'חיפה', neighborhood: 'הדר' })).toEqual({
    scope: { city: 'חיפה', neighborhood: 'הדר' }, selected_city: 'חיפה', cities: all.cities,
    neighborhoods: ['הדר', 'כרמל'], streets: ['בלפור', 'הרצל'],
  })
  expect(options({ city: 'תל אביב' }).neighborhoods).toEqual(['מרכז'])
  expect(options({ city: 'תל אביב' }).streets).toEqual(['בן יהודה', 'דיזנגוף'])
  expect(options({ neighborhood: 'הדר' }).streets).toEqual(['בלפור', 'הרצל'])
  expect(options({ city: 'לא קיימת' })).toEqual({ scope: { city: 'לא קיימת', neighborhood: null }, selected_city: 'לא קיימת',
    cities: all.cities, neighborhoods: [], streets: [] })
  expect(createLocationOptions([])({}).cities).toEqual([])
})

it('deduplicates locations and preserves explicit unknowns without making up missing location facts', () => {
  expect(createLocationOptions([...rows, rows[0]!, savedDeal(10, { neighborhood: 'unknown' })])({ city: 'חיפה' }).neighborhoods)
    .toEqual(expect.arrayContaining(['unknown', 'הדר', 'כרמל']))
  expect(createLocationOptions([...rows, rows[0]!])({}).cities).toHaveLength(2)
})

it('does not narrow option lists with own selection, search, other filters, or pagination', () => {
  const query = dealsQuerySchema.parse({ city: 'חיפה', neighborhood: 'הדר', street: 'הרצל', count: '1' })
  const first = queryDeals(rows, query)
  expect(first.rows).toEqual([rows[0]])
  expect(first.location_options.neighborhoods).toEqual(['הדר', 'כרמל'])
  expect(first.location_options.streets).toEqual(['בלפור', 'הרצל'])
  expect(queryDeals(rows, { ...query, page: 99, q: 'לא קיים', rooms: 99 }).location_options).toEqual(first.location_options)
})

it('validates and caches parent-scoped option lists and rejects obsolete, duplicate, or wrong-scope metadata', async () => {
  const { cache } = fakeCache()
  const query = dealsQuerySchema.parse({ city: 'חיפה', neighborhood: 'הדר', count: '1' })
  const run = createCachedDealsQuery(rows, cache, { warn: vi.fn() })
  const first = await run(query)
  expect(await run(query)).toEqual(first)
  expect(cache.set).toHaveBeenCalledTimes(1)
  for (const options of [undefined, { ...first.location_options, scope: { city: 'תל אביב', neighborhood: 'הדר' } },
    { ...first.location_options, scope: { city: 'חיפה', neighborhood: null } },
    { ...first.location_options, cities: ['חיפה', 'חיפה'] }]) {
    expect(parseCachedResponse(JSON.stringify({ ...first, location_options: options }), query, rows.length)).toBeUndefined()
  }
})

it('returns full hierarchical location choices on the existing paginated endpoint', async () => {
  const input = await fixture(csv(locations.map((location, i) => ({ ...location, deal_id: `D${i}` }))))
  directories.push(input.directory)
  const app = buildApp({}, { csvPath: input.path })
  try {
    await app.waitForDeals()
    const result = await app.inject(`/deals?${new URLSearchParams({ city: 'חיפה', neighborhood: 'הדר', street: 'הרצל', count: '1' })}`)
    expect(result.statusCode).toBe(200)
    expect(result.json().location_options).toEqual({ scope: { city: 'חיפה', neighborhood: 'הדר' }, selected_city: 'חיפה',
      cities: ['חיפה', 'תל אביב-יפו'], neighborhoods: ['הדר', 'כרמל'], streets: ['בלפור', 'הרצל'] })
    expect(result.json().rows).toHaveLength(1)
    expect((await app.inject('/deals?city=missing')).json().location_options.cities).toEqual(['חיפה', 'תל אביב-יפו'])
  } finally { await app.close() }
})
