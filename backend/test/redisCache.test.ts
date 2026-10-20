import { rm } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import type { RedisClientOptions } from 'redis'
import { createRedisCache } from '../src/cache/redisCache.js'
import { buildApp } from '../src/app.js'
import { csv, fixture } from './fixtures.js'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('redis', () => ({ createClient }))
afterEach(() => vi.resetAllMocks())

function connection() {
  const commands = { get: vi.fn(async () => 'cached'), set: vi.fn(async () => 'OK') }
  const client = {
    isReady: false,
    isOpen: true,
    on: vi.fn(),
    connect: vi.fn(async () => undefined),
    withAbortSignal: vi.fn((_signal: AbortSignal) => commands),
    destroy: vi.fn(() => { client.isReady = false; client.isOpen = false }),
  }
  createClient.mockReturnValue(client)
  return { client, commands }
}

it('configures bounded connections, capped reconnect backoff, error handling, and disabled offline queues', async () => {
  const { client, commands } = connection()
  const logger = { warn: vi.fn() }
  const cache = createRedisCache('redis://cache:6379', logger)
  expect(cache.ready).toBe(false)
  expect(createClient).not.toHaveBeenCalled()
  cache.start()
  cache.start()
  expect(createClient).toHaveBeenCalledTimes(1)
  expect(client.connect).toHaveBeenCalledTimes(1)
  const options = createClient.mock.calls[0]![0] as RedisClientOptions
  expect(options).toMatchObject({ url: 'redis://cache:6379', disableOfflineQueue: true, commandsQueueMaxLength: 100, socket: { connectTimeout: 500 } })
  const strategy = options.socket!.reconnectStrategy
  expect(typeof strategy).toBe('function')
  if (typeof strategy !== 'function') throw new Error('Expected reconnect strategy')
  expect([0, 1, 6, 100].map((attempt) => strategy(attempt, new Error('hidden')))).toEqual([100, 200, 5000, 5000])
  expect(client.on.mock.calls[0]![0]).toBe('error')
  client.on.mock.calls[0]![1]()
  expect(logger.warn).toHaveBeenCalledWith({ operation: 'connection' }, expect.any(String))
  client.isReady = true
  expect(cache.ready).toBe(true)
  const signal = new AbortController().signal
  expect(await cache.get('key', signal)).toBe('cached')
  await cache.set('key', 'body', 300, signal)
  expect(client.withAbortSignal).toHaveBeenCalledWith(signal)
  expect(commands.get).toHaveBeenCalledWith('key')
  expect(commands.set).toHaveBeenCalledWith('key', 'body', { expiration: { type: 'EX', value: 300 } })
  cache.close()
  cache.close()
  cache.start()
  expect(cache.ready).toBe(false)
  expect(client.destroy).toHaveBeenCalledTimes(1)
  expect(client.connect).toHaveBeenCalledTimes(1)
})

it('does not wait for a pending connection and cancels reconnects during close', () => {
  const { client } = connection()
  client.connect.mockImplementation(() => new Promise(() => {}))
  const cache = createRedisCache('redis://cache', { warn: vi.fn() })
  expect(cache.start()).toBeUndefined()
  expect(cache.ready).toBe(false)
  cache.close()
  expect(client.destroy).toHaveBeenCalledTimes(1)
})

it('handles rejected connections and shutdown failures with sanitized warnings', async () => {
  const { client } = connection()
  client.connect.mockRejectedValue(new Error('redis://password@private-host'))
  client.destroy.mockImplementation(() => { throw new Error('secret') })
  const logger = { warn: vi.fn() }
  const cache = createRedisCache('redis://cache', logger)
  cache.start()
  await Promise.resolve()
  expect(logger.warn).toHaveBeenCalledWith({ operation: 'connect' }, expect.any(String))
  cache.close()
  expect(logger.warn).toHaveBeenCalledWith({ operation: 'close' }, expect.any(String))
  expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/password|private-host|secret/)
})

it('handles synchronous initialization failures and closing before starting', () => {
  const logger = { warn: vi.fn() }
  createClient.mockImplementation(() => { throw new Error('private-url') })
  const failed = createRedisCache('redis://cache', logger)
  failed.start()
  expect(failed.ready).toBe(false)
  failed.close()
  expect(logger.warn).toHaveBeenCalledWith({ operation: 'initialize' }, expect.any(String))
  expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('private-url')
  createClient.mockClear()
  const closed = createRedisCache('redis://cache', logger)
  closed.close()
  closed.start()
  expect(createClient).not.toHaveBeenCalled()
})

it('starts configured Redis only after import and serves requests while the connection is pending', async () => {
  const { client } = connection()
  client.connect.mockImplementation(() => new Promise(() => {}))
  const input = await fixture(csv())
  const app = buildApp({}, { csvPath: input.path, redisUrl: 'redis://cache' })
  try {
    expect(createClient).not.toHaveBeenCalled()
    await app.waitForDeals()
    const result = await app.inject('/deals')
    expect(result.statusCode).toBe(200)
    expect(result.json().total).toBe(1)
    expect(client.connect).toHaveBeenCalledTimes(1)
    expect(client.withAbortSignal).not.toHaveBeenCalled()
  } finally {
    await app.close()
    await rm(input.directory, { recursive: true })
  }
  expect(client.destroy).toHaveBeenCalledTimes(1)
})
