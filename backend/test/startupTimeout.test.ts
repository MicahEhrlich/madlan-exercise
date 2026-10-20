import { afterEach, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadDeals } from '../src/deals/loadDeals.js'
import { inspectDeal } from '../src/deals/validateDeal.js'
import { validRow } from './fixtures.js'

vi.mock('../src/deals/loadDeals.js', () => ({ loadDeals: vi.fn() }))
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

it('waits beyond Fastify’s old 10-second timeout and only publishes deals after import finishes', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let finishImport!: () => void
  let signalStarted!: () => void
  const started = new Promise<void>((resolve) => { signalStarted = resolve })
  const finished = new Promise<void>((resolve) => { finishImport = resolve })
  const deals = Object.freeze([Object.freeze({ ...inspectDeal(validRow).deal, row_status: 'original' as const, fixed_fields: Object.freeze([]) })])
  vi.mocked(loadDeals).mockImplementation(async () => {
    signalStarted()
    await finished
    return deals
  })
  const app = buildApp()
  let state = 'pending'
  const ready = app.ready().then(() => { state = 'ready' }, () => { state = 'failed' })
  try {
    await started
    await vi.advanceTimersByTimeAsync(31_000)
    expect(state).toBe('pending')
    expect(app.deals).toHaveLength(0)
    finishImport()
    await ready
    expect(state).toBe('ready')
    expect(app.deals).toBe(deals)
    expect(vi.mocked(loadDeals)).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' })
  } finally {
    finishImport()
    await ready
    vi.useRealTimers()
    await app.close()
  }
})

it('continues to reject readiness on import errors after a long startup', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let failImport!: (error: Error) => void
  let signalStarted!: () => void
  const started = new Promise<void>((resolve) => { signalStarted = resolve })
  const finished = new Promise<never>((_resolve, reject) => { failImport = reject })
  vi.mocked(loadDeals).mockImplementation(async () => { signalStarted(); return finished })
  const app = buildApp()
  const ready = app.ready().then(() => undefined, (error: Error) => error)
  try {
    await started
    await vi.advanceTimersByTimeAsync(31_000)
    failImport(new Error('CSV import failed'))
    expect(await ready).toMatchObject({ message: 'CSV import failed' })
    expect(app.deals).toHaveLength(0)
  } finally {
    failImport(new Error('cleanup'))
    await ready
    vi.useRealTimers()
    await app.close()
  }
})
