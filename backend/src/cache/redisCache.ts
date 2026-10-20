import { createClient } from 'redis'
import type { RedisClientOptions } from 'redis'
import type { CacheLogger, DealsCache } from './types.js'

interface RedisCommands {
  get(key: string): Promise<string | null>
  set(key: string, value: string, options: { expiration: { type: 'EX'; value: number } }): Promise<unknown>
}

export interface RedisConnection {
  readonly isReady: boolean
  readonly isOpen: boolean
  on(event: 'error', listener: () => void): unknown
  connect(): Promise<unknown>
  withAbortSignal(signal: AbortSignal): RedisCommands
  destroy(): void
}

export type RedisFactory = (options: RedisClientOptions) => RedisConnection

export function createRedisCache(url: string, logger: CacheLogger, factory: RedisFactory = (options) => createClient(options)): DealsCache {
  let client: RedisConnection | undefined
  let closed = false
  return {
    get ready() { return !closed && (client?.isReady ?? false) },
    start() {
      if (client || closed) return
      try {
        client = factory({
          url,
          disableOfflineQueue: true,
          commandsQueueMaxLength: 100,
          socket: {
            connectTimeout: 500,
            reconnectStrategy: (retries) => Math.min(100 * 2 ** Math.min(retries, 6), 5000),
          },
        })
        client.on('error', () => logger.warn({ operation: 'connection' }, 'Redis cache connection unavailable'))
        // Redis may keep reconnecting; readiness must not wait for that promise.
        void client.connect().catch(() => logger.warn({ operation: 'connect' }, 'Redis cache connection failed'))
      } catch {
        logger.warn({ operation: 'initialize' }, 'Redis cache initialization failed')
      }
    },
    get(key, signal) { return client!.withAbortSignal(signal).get(key) },
    set(key, value, ttlSeconds, signal) {
      return client!.withAbortSignal(signal).set(key, value, { expiration: { type: 'EX', value: ttlSeconds } })
    },
    close() {
      closed = true
      try {
        // Also cancels reconnects and in-flight commands; shutdown never waits on Redis.
        if (client?.isOpen) client.destroy()
      } catch {
        logger.warn({ operation: 'close' }, 'Redis cache shutdown failed')
      }
    },
  }
}
