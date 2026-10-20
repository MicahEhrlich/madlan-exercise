import { createHash } from 'node:crypto'
import { queryDeals } from '../deals/queryDeals.js'
import type { DealsQuery } from '../deals/queryDeals.js'
import type { DealCollection } from '../deals/types.js'
import { parseCachedResponse } from './cachedResponse.js'
import { cacheOperationTimeoutMs, defaultCacheTtlSeconds } from './types.js'
import type { CacheLogger, DealsCache } from './types.js'
import { neighborhoodDiscounts } from '../deals/neighborhoodDiscounts.js'
import { createLocationOptions } from '../deals/locationOptions.js'
import { createFilterOptions } from '../deals/filterOptions.js'

/** Canonical values include defaults; an empty search is equivalent to no search. */
export function dealsCacheKey(datasetHash: string, query: DealsQuery) {
  const normalized = { ...query, q: query.q || undefined }
  const entries = Object.entries(normalized).filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
  return `deals:v6:${datasetHash}:${JSON.stringify(Object.fromEntries(entries))}`
}

async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error('Cache operation timed out'))
        }, cacheOperationTimeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer!)
  }
}

export function createCachedDealsQuery(deals: DealCollection, cache: DealsCache | undefined, logger: CacheLogger, ttlSeconds = defaultCacheTtlSeconds) {
  const datasetHash = createHash('sha256').update(JSON.stringify(deals)).digest('hex')
  const discountIds = neighborhoodDiscounts(deals)
  const locationOptions = createLocationOptions(deals)
  const filterOptions = createFilterOptions(deals)
  return async (query: DealsQuery) => {
    if (!cache?.ready) return queryDeals(deals, query, discountIds, locationOptions, filterOptions)
    const key = dealsCacheKey(datasetHash, query)
    let cached: string | null
    try {
      cached = await bounded((signal) => cache.get(key, signal))
    } catch {
      logger.warn({ operation: 'get' }, 'Deals cache unavailable; serving uncached results')
      return queryDeals(deals, query, discountIds, locationOptions, filterOptions)
    }
    if (cached !== null) {
      const result = parseCachedResponse(cached, query, deals.length, discountIds)
      if (result) return result
      logger.warn({ operation: 'validate' }, 'Invalid deals cache entry; recalculating results')
    }
    const result = queryDeals(deals, query, discountIds, locationOptions, filterOptions)
    try {
      await bounded((signal) => cache.set(key, JSON.stringify(result), ttlSeconds, signal))
    } catch {
      logger.warn({ operation: 'set' }, 'Deals cache write failed; serving calculated results')
    }
    return result
  }
}
