import { rm } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import * as queries from '../src/deals/queryDeals.js'
import { dealsCacheKey, createCachedDealsQuery } from '../src/cache/cachedDeals.js'
import { csv, fixture } from './fixtures.js'
import { fakeCache } from './cacheFixtures.js'

const apps: ReturnType<typeof buildApp>[] = []
const directories: string[] = []
afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(apps.splice(0).map((app) => app.close()))
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
  vi.restoreAllMocks()
})

async function setup(options: Parameters<typeof buildApp>[1] = {}, content = csv([{}, { deal_id: 'D2', rooms: '4', price_per_sqm: '' }, { deal_id: 'D3', city: 'תל אביב' }])) {
  const input = await fixture(content)
  directories.push(input.directory)
  const { cache, entries } = fakeCache()
  const app = buildApp({}, { csvPath: input.path, cache, ...options })
  apps.push(app)
  expect(cache.start).not.toHaveBeenCalled()
  await app.waitForDeals()
  return { app, cache, entries }
}

it('caches complete responses, skips full-dataset recomputation on hits, and closes the adapter', async () => {
  const { app, cache } = await setup()
  const compute = vi.spyOn(queries, 'queryDeals')
  const first = await app.inject('/deals')
  const second = await app.inject('/deals?count=20&page=1')
  expect(second.json()).toEqual(first.json())
  expect(compute.mock.calls.filter(([deals]) => deals === app.deals)).toHaveLength(1)
  expect(cache.get).toHaveBeenCalledTimes(2)
  expect(cache.set).toHaveBeenCalledTimes(1)
  expect(cache.start).toHaveBeenCalledTimes(1)
  const [key, text, ttl] = cache.set.mock.calls[0]!
  expect(key).toMatch(/^deals:v1:[a-f0-9]{64}:/)
  expect(ttl).toBe(300)
  expect(JSON.parse(text).rows[1].fixed_fields).toEqual(['price_per_sqm'])
  await app.close()
  expect(cache.close).toHaveBeenCalledTimes(1)
})

it('shares cache entries for reordered, normalized query params and distinguishes every query field', async () => {
  const { app, cache } = await setup()
  const first = await app.inject({ url: '/deals', query: { city: ' חיפה ', has_parking: 'false', rooms: '03.0', q: ' הרצל ' } })
  const second = await app.inject({ url: '/deals', query: { q: 'הרצל', rooms: '3', has_parking: 'false', city: 'חיפה', page: '1', count: '20' } })
  expect(first.json()).toEqual(second.json())
  expect(cache.set).toHaveBeenCalledTimes(1)
  const base = queries.dealsQuerySchema.parse({})
  const filters: Record<string, string> = {
    city: 'חיפה', neighborhood: 'הדר', street: 'הרצל', property_type: 'דירה', rooms: '3', size_sqm: '100', floor: '0', total_floors: '4',
    year_built: 'unknown', condition: 'unknown', has_elevator: 'true', has_parking: 'false', has_balcony: 'false', has_safe_room: 'false',
    deal_date: '2024-02-29', price_nis: '2000000', price_per_sqm: '20000', source: 'מקור', row_status: 'fixed', q: 'הרצל', page: '2', count: '1',
  }
  const keys = Object.entries(filters).map(([key, value]) => dealsCacheKey('dataset', queries.dealsQuerySchema.parse({ [key]: value })))
  expect(new Set(keys).size).toBe(Object.keys(filters).length)
  expect(keys).not.toContain(dealsCacheKey('dataset', base))
  expect(dealsCacheKey('dataset', queries.dealsQuerySchema.parse({ q: '  ' }))).toBe(dealsCacheKey('dataset', base))
})

it('separates datasets even when only repair metadata changed', async () => {
  const { cache } = fakeCache()
  const first = await setup({ cache }, csv([{}]))
  const second = await setup({ cache }, csv([{ price_per_sqm: '' }]))
  const firstResult = (await first.app.inject('/deals')).json()
  const secondResult = (await second.app.inject('/deals')).json()
  expect(firstResult.rows[0].fixed_fields).toEqual([])
  expect(secondResult.rows[0].fixed_fields).toEqual(['price_per_sqm'])
  expect(cache.set.mock.calls[0]![0]).not.toBe(cache.set.mock.calls[1]![0])
})

it('caches empty and out-of-range pages and honors the configured expiration', async () => {
  const { app, cache } = await setup({ redisCacheTtlSeconds: 60 })
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  for (const url of ['/deals?city=missing', '/deals?page=10&count=1']) {
    const first = await app.inject(url)
    expect(first.json().rows).toEqual([])
    expect((await app.inject(url)).json()).toEqual(first.json())
  }
  expect(cache.set).toHaveBeenCalledTimes(2)
  expect(cache.set.mock.calls[0]![2]).toBe(60)
  vi.spyOn(Date, 'now').mockReturnValue(now + 60000)
  await app.inject('/deals?city=missing')
  expect(cache.set).toHaveBeenCalledTimes(3)
})

it('bypasses Redis for invalid queries and while disconnected', async () => {
  const { app, cache } = await setup()
  expect((await app.inject('/deals?page=0')).statusCode).toBe(400)
  expect(cache.get).not.toHaveBeenCalled()
  expect(cache.set).not.toHaveBeenCalled()
  cache.ready = false
  expect((await app.inject('/deals')).statusCode).toBe(200)
  expect(cache.get).not.toHaveBeenCalled()
  cache.ready = true
  await app.inject('/deals')
  expect(cache.set).toHaveBeenCalledTimes(1)
})

it.each(['get', 'set'] as const)('serves correct results and sanitized logs when cache %s fails', async (operation) => {
  const { cache } = fakeCache()
  cache[operation].mockRejectedValue(new Error('redis://secret@host?city=sensitive'))
  const { app } = await setup({ cache })
  const log = { warn: vi.fn() }
  const run = createCachedDealsQuery(app.deals, cache, log)
  expect(await run(queries.dealsQuerySchema.parse({}))).toEqual(queries.queryDeals(app.deals, queries.dealsQuerySchema.parse({})))
  expect(log.warn).toHaveBeenCalledWith({ operation }, expect.any(String))
  expect(JSON.stringify(log.warn.mock.calls)).not.toContain('secret')
  expect(JSON.stringify(log.warn.mock.calls)).not.toContain('sensitive')
})

it.each(['get', 'set'] as const)('bounds a hanging cache %s to 200ms even if cancellation is ignored', async (operation) => {
  const { app, cache } = await setup()
  cache[operation].mockImplementation(() => new Promise(() => {}))
  vi.useFakeTimers()
  const log = { warn: vi.fn() }
  const query = queries.dealsQuerySchema.parse({})
  const result = createCachedDealsQuery(app.deals, cache, log)(query)
  let finished = false
  void result.then(() => { finished = true })
  await vi.advanceTimersByTimeAsync(199)
  expect(finished).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(await result).toEqual(queries.queryDeals(app.deals, query))
  const args = cache[operation].mock.calls[0]!
  expect((args[args.length - 1] as AbortSignal).aborted).toBe(true)
})

it('rejects invalid TTL values for programmatic callers', () => {
  expect(() => buildApp({}, { redisCacheTtlSeconds: 0 })).toThrow('REDIS_CACHE_TTL_SECONDS')
})

it.each(['broken JSON', JSON.stringify({ page: 1, count: 20, total: 3, total_pages: 1, rows: [] })])('recalculates and replaces corrupt cached entries: %s', async (text) => {
  const { app, cache } = await setup()
  cache.get.mockResolvedValueOnce(text)
  const result = await app.inject('/deals')
  expect(result.statusCode).toBe(200)
  expect(result.json().rows).toEqual(app.deals)
  expect(JSON.parse(cache.set.mock.calls[0]![1])).toEqual(result.json())
  expect((await app.inject('/deals')).json()).toEqual(result.json())
  expect(cache.set).toHaveBeenCalledTimes(1)
})
