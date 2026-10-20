import type { FastifyBaseLogger } from 'fastify'

export const defaultCacheTtlSeconds = 300
export const cacheOperationTimeoutMs = 200
export function validateCacheTtlSeconds(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('REDIS_CACHE_TTL_SECONDS must be a positive safe integer')
  return value
}
export type CacheLogger = Pick<FastifyBaseLogger, 'warn'>

/** The cache is optional infrastructure; its operations must support cancellation. */
export interface DealsCache {
  readonly ready: boolean
  start(): void
  get(key: string, signal: AbortSignal): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number, signal: AbortSignal): Promise<unknown>
  close(): void
}

export interface CacheOptions {
  redisUrl?: string
  redisCacheTtlSeconds?: number
  cache?: DealsCache
}
