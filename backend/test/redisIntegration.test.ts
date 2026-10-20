import { createHash, randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { createClient } from 'redis'
import { expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { createRedisCache } from '../src/cache/redisCache.js'
import { dealsCacheKey } from '../src/cache/cachedDeals.js'
import { dealsQuerySchema } from '../src/deals/queryDeals.js'
import { csv, fixture } from './fixtures.js'

// Optional live check; the ordinary test suite requires no Redis service.
it.skipIf(!process.env.REDIS_TEST_URL)('stores real Redis responses, preserves hits, expires entries, and replaces corrupt JSON', async () => {
  const url = process.env.REDIS_TEST_URL!
  const input = await fixture(csv([{ deal_id: randomUUID(), price_per_sqm: '' }]))
  const cache = createRedisCache(url, { warn() {} })
  const app = buildApp({}, { csvPath: input.path, cache, redisCacheTtlSeconds: 1 })
  const inspector = createClient({ url, socket: { connectTimeout: 500, reconnectStrategy: false } })
  inspector.on('error', () => {})
  let key: string | undefined
  try {
    await inspector.connect()
    await app.waitForDeals()
    for (let attempt = 0; attempt < 100 && !cache.ready; attempt++) await setTimeout(10)
    expect(cache.ready).toBe(true)
    const result = await app.inject('/deals')
    const hash = createHash('sha256').update(JSON.stringify(app.deals)).digest('hex')
    key = dealsCacheKey(hash, dealsQuerySchema.parse({}))
    expect(JSON.parse((await inspector.get(key))!)).toEqual(result.json())
    expect(result.json().rows[0].fixed_fields).toEqual(['price_per_sqm'])
    expect(await inspector.ttl(key)).toBeGreaterThan(0)
    expect(await inspector.ttl(key)).toBeLessThanOrEqual(1)
    // A hit must not write: a write would restore the configured 1-second TTL.
    await inspector.expire(key, 60)
    expect((await app.inject('/deals?count=20&page=1')).json()).toEqual(result.json())
    expect(await inspector.ttl(key)).toBeGreaterThan(1)
    await inspector.pExpire(key, 30)
    await setTimeout(60)
    expect(await inspector.exists(key)).toBe(0)
    expect((await app.inject('/deals')).json()).toEqual(result.json())
    expect(await inspector.exists(key)).toBe(1)
    await inspector.set(key, 'broken JSON')
    expect((await app.inject('/deals')).json()).toEqual(result.json())
    expect(JSON.parse((await inspector.get(key))!)).toEqual(result.json())
  } finally {
    await app.close()
    if (inspector.isReady && key) await inspector.del(key)
    if (inspector.isOpen) inspector.destroy()
    await rm(input.directory, { recursive: true })
  }
})
