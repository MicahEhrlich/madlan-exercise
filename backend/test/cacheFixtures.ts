import { vi } from 'vitest'
import type { DealsCache } from '../src/cache/types.js'

export function fakeCache() {
  const entries = new Map<string, { value: string; expires: number }>()
  const cache = {
    ready: true as boolean,
    start: vi.fn(),
    close: vi.fn(),
    get: vi.fn<DealsCache['get']>(async (key) => {
      const entry = entries.get(key)
      return entry && entry.expires > Date.now() ? entry.value : null
    }),
    set: vi.fn<DealsCache['set']>(async (key, value, ttl) => {
      entries.set(key, { value, expires: Date.now() + ttl * 1000 })
      return 'OK'
    }),
  } satisfies DealsCache
  return { cache, entries }
}
