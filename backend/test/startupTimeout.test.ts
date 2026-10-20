import { afterEach, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadDealsWithSummary } from '../src/deals/loadDeals.js'
import { inspectDeal } from '../src/deals/validateDeal.js'
import type { DealImport } from '../src/deals/types.js'
import { validRow } from './fixtures.js'
import { fakeCache } from './cacheFixtures.js'

vi.mock('../src/deals/loadDeals.js', () => ({ loadDealsWithSummary: vi.fn() }))
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

const imported: DealImport = {
  deals: Object.freeze([Object.freeze({ ...inspectDeal(validRow).deal, row_status: 'original' as const, fixed_fields: Object.freeze([]) })]),
  summary: { total_rows: 1, parsed_rows: 1, completed_rows: 0 },
}

function pendingImport() {
  let finish!: (value: DealImport) => void
  let fail!: (reason: Error) => void
  vi.mocked(loadDealsWithSummary).mockImplementation(() => new Promise<DealImport>((resolve, reject) => { finish = resolve; fail = reject }))
  return { finish: () => finish(imported), fail: () => fail(new Error('private import failure')) }
}

it('serves processing immediately for slow imports and publishes the complete data atomically', async () => {
  const pending = pendingImport()
  const { cache } = fakeCache()
  const app = buildApp({}, { cache })
  try {
    await app.ready()
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' })
    for (const path of ['/deals?page=1', '/deal', '/deals/summary']) {
      const response = await app.inject(path)
      expect(response.statusCode).toBe(202)
      expect(response.json()).toEqual({ status: 'processing', message: 'הנתונים עדיין בעיבוד. נא להמתין.' })
      expect(response.headers['retry-after']).toBe('2')
      expect(response.headers['cache-control']).toBe('no-store')
    }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await vi.advanceTimersByTimeAsync(31000)
    vi.useRealTimers()
    expect((await app.inject('/deals')).statusCode).toBe(202)
    expect(app.deals).toEqual([])
    expect(app.importSummary).toBeNull()
    expect(cache.get).not.toHaveBeenCalled()
    expect(cache.set).not.toHaveBeenCalled()
    expect(cache.start).not.toHaveBeenCalled()
    expect((await app.inject('/deals?page=0')).statusCode).toBe(400)
    pending.finish()
    await app.waitForDeals()
    expect(app.deals).toBe(imported.deals)
    expect((await app.inject('/deals')).json().rows).toEqual(imported.deals)
    expect((await app.inject('/deal')).json()).toEqual((await app.inject('/deals')).json())
    expect((await app.inject('/deals/summary')).json()).toEqual(imported.summary)
    expect(cache.start).toHaveBeenCalledTimes(1)
    expect(vi.mocked(loadDealsWithSummary)).toHaveBeenCalledTimes(1)
  } finally { pending.finish(); await app.close() }
})

it('keeps the HTTP server available but returns a distinct failure after import errors', async () => {
  const pending = pendingImport()
  const app = buildApp()
  try {
    await app.ready()
    pending.fail()
    await expect(app.waitForDeals()).rejects.toThrow('private import failure')
    for (const path of ['/deals', '/deal', '/deals/summary']) {
      const response = await app.inject(path)
      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({ status: 'error', message: 'טעינת הנתונים נכשלה. נסו שוב מאוחר יותר.' })
      expect(response.body).not.toContain('private')
      expect(response.headers['cache-control']).toBe('no-store')
    }
    expect(app.deals).toEqual([])
    expect(app.importSummary).toBeNull()
  } finally { await app.close() }
})

it('does not publish data or start Redis if shutdown happens during import', async () => {
  const pending = pendingImport()
  const { cache } = fakeCache()
  const app = buildApp({}, { cache })
  await app.ready()
  const loaded = app.waitForDeals().catch((error: unknown) => error)
  await app.close()
  pending.finish()
  expect(await loaded).toBeInstanceOf(Error)
  expect(app.deals).toEqual([])
  expect(app.importSummary).toBeNull()
  expect(cache.start).not.toHaveBeenCalled()
  expect(cache.close).toHaveBeenCalledTimes(1)
})
