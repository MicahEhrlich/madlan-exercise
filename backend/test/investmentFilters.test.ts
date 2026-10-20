import { rm } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { neighborhoodDiscounts } from '../src/deals/neighborhoodDiscounts.js'
import { queryDeals, dealsQuerySchema } from '../src/deals/queryDeals.js'
import { createCachedDealsQuery, dealsCacheKey } from '../src/cache/cachedDeals.js'
import { parseCachedResponse } from '../src/cache/cachedResponse.js'
import { savedDeal } from './analysisFixtures.js'
import { fakeCache } from './cacheFixtures.js'
import { buildApp } from '../src/app.js'
import { csv, fixture } from './fixtures.js'

const rows = [10000, 20000, 30000, 40000].map((price, i) => savedDeal(i + 2, {
  price_per_sqm: price, price_nis: price * 100, year_built: i === 0 ? 2020 : i === 1 ? 'unknown' : 2019,
  has_elevator: true, has_parking: i === 0, has_safe_room: i === 0,
}))
const logger = { warn: vi.fn() }
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true }))) })

it('uses price per sqm, city, neighborhood, property type, and at least three other accepted rows', () => {
  const distractors = [
    savedDeal(6, { city: 'אחרת', price_per_sqm: 1 }),
    savedDeal(7, { neighborhood: 'אחרת', price_per_sqm: 1 }),
    savedDeal(8, { property_type: 'בית', price_per_sqm: 1 }),
  ]
  expect([...neighborhoodDiscounts([...rows, ...distractors])]).toEqual(['row-2', 'row-3'])
  expect(neighborhoodDiscounts(rows.slice(0, 3)).size).toBe(0)
  for (const neighborhood of ['unknown', ' UnKnOwN ', '', ' ']) {
    expect(neighborhoodDiscounts(rows.map((row) => ({ ...row, neighborhood }))).size).toBe(0)
  }
  const equal = Array.from({ length: 9 }, (_, i) => savedDeal(i + 2))
  expect(neighborhoodDiscounts(equal).size).toBe(0)
  expect(neighborhoodDiscounts(rows.map((row) => ({ ...row, price_per_sqm: Infinity }))).size).toBe(0)
  expect(neighborhoodDiscounts(rows.map((row) => ({ ...row, price_per_sqm: 0 }))).size).toBe(0)
})

it('excludes equal-to-average rows and compares all accepted data before other filters and pagination', () => {
  const same = [10000, 20000, 20000, 30000].map((price, i) => savedDeal(i + 2, { price_per_sqm: price }))
  expect([...neighborhoodDiscounts(same)]).toEqual(['row-2'])
  const query = dealsQuerySchema.parse({ below_neighborhood_average: 'true', count: '1', page: '2' })
  expect(queryDeals(rows, query)).toMatchObject({ total: 2, total_pages: 2, rows: [rows[1]] })
  expect(queryDeals(rows, { ...query, page: 1, year_built_min: 2020 })).toMatchObject({ total: 1, rows: [rows[0]] })
  expect(queryDeals(rows, { ...query, page: 1, below_neighborhood_average: false }).total).toBe(4)
  expect(queryDeals(rows, { ...query, page: 1, q: '2020' }).rows).toEqual([rows[0]])
})

it('applies inclusive build-year minimum and full-package filters together, excluding unknown years', () => {
  const query = dealsQuerySchema.parse({ year_built_min: '2020', has_parking: 'true', has_safe_room: 'true', has_elevator: 'true' })
  expect(queryDeals(rows, query).rows).toEqual([rows[0]])
  expect(queryDeals(rows, { ...query, year_built_min: 2021 }).total).toBe(0)
  expect(queryDeals(rows, dealsQuerySchema.parse({ year_built_min: '2019' })).total).toBe(3)
})

it('keeps cached-page validation anchored to global neighborhood benchmarks', async () => {
  const { cache } = fakeCache()
  const query = dealsQuerySchema.parse({ below_neighborhood_average: 'true', count: '1', page: '2' })
  const cached = createCachedDealsQuery(rows, cache, logger)
  const first = await cached(query)
  expect(first.rows).toEqual([rows[1]])
  expect(await cached(query)).toEqual(first)
  expect(cache.set).toHaveBeenCalledTimes(1)
  expect(parseCachedResponse(JSON.stringify(first), query, rows.length)).toBeUndefined()
  const ids = neighborhoodDiscounts(rows)
  expect(parseCachedResponse(JSON.stringify(first), query, rows.length, ids)).toEqual(first)
  expect(parseCachedResponse(JSON.stringify({ ...first, rows: [rows[3]] }), query, rows.length, ids)).toBeUndefined()
  expect(dealsCacheKey('dataset', query)).not.toBe(dealsCacheKey('dataset', { ...query, below_neighborhood_average: false }))
  expect(dealsCacheKey('dataset', query)).not.toBe(dealsCacheKey('dataset', { ...query, year_built_min: 2020 }))
})

it('accepts the new API filters, combines them, and rejects malformed parameters without model calls', async () => {
  const input = await fixture(csv(rows.map((row) => ({ deal_id: row.deal_id,
    price_nis: String(row.price_nis), price_per_sqm: String(row.price_per_sqm), year_built: String(row.year_built),
    has_parking: String(row.has_parking), has_elevator: String(row.has_elevator), has_safe_room: String(row.has_safe_room),
  }))))
  directories.push(input.directory)
  const transport = vi.fn()
  const app = buildApp({}, { csvPath: input.path, analysisTransport: transport })
  try {
    await app.waitForDeals()
    const response = await app.inject('/deals?below_neighborhood_average=true&year_built_min=2020&has_parking=true&has_safe_room=true&has_elevator=true')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ total: 1, rows: [{ deal_id: 'D2' }] })
    for (const param of ['year_built_min=abc', 'year_built_min=0', 'year_built_min=-1', 'year_built_min=2020.5',
      'below_neighborhood_average=yes', 'below_neighborhood_average=true&below_neighborhood_average=false']) {
      expect((await app.inject(`/deals?${param}`)).statusCode).toBe(400)
    }
    expect(transport).not.toHaveBeenCalled()
  } finally { await app.close() }
})
