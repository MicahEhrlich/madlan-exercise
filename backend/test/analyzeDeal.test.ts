import { afterEach, expect, it, vi } from 'vitest'
import { analysisCacheKey, createDealAnalyzer } from '../src/analysis/analyzeDeal.js'
import { withinDeadline } from '../src/analysis/deadline.js'
import type { AnalysisTransport } from '../src/analysis/transport.js'
import { comparableDeals, savedDeal, successfulAnalysis } from './analysisFixtures.js'
import { fakeCache } from './cacheFixtures.js'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
const logger = () => ({ info: vi.fn(), warn: vi.fn() })
const unavailable = { status: 'unavailable' }

it.each([
  { street: 'unknown', neighborhood: ' UNKNOWN ' }, { street: '', neighborhood: ' ' },
  { street: undefined, neighborhood: undefined },
])('checks local eligibility before comparison selection, cache reads, or LLM work: %j', async (missing) => {
  const { cache } = fakeCache()
  const transport = vi.fn(successfulAnalysis)
  const analyze = createDealAnalyzer(comparableDeals(), cache, logger(), { anthropicApiKey: 'test', analysisTransport: transport })
  expect(await analyze(savedDeal(2, missing))).toEqual(unavailable)
  expect(cache.get).not.toHaveBeenCalled()
  expect(transport).not.toHaveBeenCalled()
})

it('returns unavailable without credentials or adequate comparisons', async () => {
  const { cache } = fakeCache()
  const transport = vi.fn(successfulAnalysis)
  expect(await createDealAnalyzer(comparableDeals(), cache, logger(), { analysisTransport: transport })(savedDeal())).toEqual(unavailable)
  expect(await createDealAnalyzer([savedDeal()], cache, logger(), { anthropicApiKey: 'test', analysisTransport: transport })(savedDeal())).toEqual(unavailable)
  expect(transport).not.toHaveBeenCalled()
  expect(cache.get).not.toHaveBeenCalled()
})

it('deduplicates concurrent requests, caches successful analyses, and expires them after five minutes', async () => {
  vi.useFakeTimers()
  const transport = vi.fn(successfulAnalysis)
  const log = logger()
  const analyze = createDealAnalyzer(comparableDeals(), undefined, log, { anthropicApiKey: 'test', analysisTransport: transport })
  const [first, second] = await Promise.all([analyze(savedDeal()), analyze(savedDeal())])
  expect(first).toEqual(second)
  expect(Object.keys(first)).toEqual(['valuation_assessment', 'estimated_discount_premium_pct', 'key_strengths', 'risk_factors'])
  expect(await analyze(savedDeal())).toEqual(first)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ scope: 'street', count: 3, outcome: 'analyzed' }), 'Deal analysis complete')
  await vi.advanceTimersByTimeAsync(300000)
  await analyze(savedDeal())
  expect(transport).toHaveBeenCalledTimes(2)
})

it('shares validated Redis results between analyzers without extending the original expiry', async () => {
  vi.useFakeTimers()
  const { cache } = fakeCache()
  const transport = vi.fn(successfulAnalysis)
  const options = { anthropicApiKey: 'test', analysisTransport: transport, anthropicModel: 'configured' }
  const first = createDealAnalyzer(comparableDeals(), cache, logger(), options)
  const result = await first(savedDeal())
  expect(cache.set).toHaveBeenCalledWith(expect.stringMatching(/^analysis:v1:/), expect.any(String), 300, expect.any(AbortSignal))
  await vi.advanceTimersByTimeAsync(299000)
  const second = createDealAnalyzer(comparableDeals(), cache, logger(), options)
  expect(await second(savedDeal())).toEqual(result)
  expect(transport).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1000)
  await second(savedDeal())
  expect(transport).toHaveBeenCalledTimes(2)
})

it('separates dataset, row, model, and policy in cache keys', async () => {
  const { cache } = fakeCache()
  const transport = vi.fn(successfulAnalysis)
  for (const [deals, model, target] of [
    [comparableDeals(), 'one', savedDeal()],
    [comparableDeals(), 'two', savedDeal()],
    [comparableDeals(), 'one', savedDeal(3)],
    [comparableDeals().map((row) => ({ ...row, source: 'אחר' })), 'one', savedDeal()],
  ] as const) {
    await createDealAnalyzer(deals, cache, logger(), { anthropicApiKey: 'test', anthropicModel: model, analysisTransport: transport })(target)
  }
  expect(new Set(cache.set.mock.calls.map(([key]) => key)).size).toBe(4)
  expect(analysisCacheKey('dataset', 'row-2', 'model')).toBe('analysis:v1:dataset:["row-2","model"]')
})

it.each(['broken', 'unsupported', 'expired', 'far_future', 'get_failure', 'write_failure', 'offline'] as const)('survives %s cache data or infrastructure', async (failure) => {
  const { cache } = fakeCache()
  if (failure === 'get_failure') cache.get.mockRejectedValue(new Error('private cache error'))
  else if (failure === 'write_failure') cache.set.mockRejectedValue(new Error('private cache error'))
  else if (failure === 'offline') cache.ready = false
  else cache.get.mockResolvedValue(failure === 'broken' ? '{' : JSON.stringify({
    expires_at: Date.now() + (failure === 'expired' ? -1 : failure === 'far_future' ? 900000 : 10000),
    analysis: { valuation_assessment: 'Fairly Priced', estimated_discount_premium_pct: 0,
      key_strengths: [], risk_factors: ['unsupported'] },
  }))
  const transport = vi.fn(successfulAnalysis)
  const result = await createDealAnalyzer(comparableDeals(), cache, logger(), { anthropicApiKey: 'test', analysisTransport: transport })(savedDeal())
  expect(result).toHaveProperty('valuation_assessment', 'Fairly Priced')
  expect(transport).toHaveBeenCalledTimes(1)
})

it('bounds stalled cache reads and writes independently while allowing the analysis to complete', async () => {
  vi.useFakeTimers()
  const { cache } = fakeCache()
  cache.get.mockImplementation(() => new Promise(() => {}))
  cache.set.mockImplementation(() => new Promise(() => {}))
  const task = createDealAnalyzer(comparableDeals(), cache, logger(), { anthropicApiKey: 'test', analysisTransport: successfulAnalysis })(savedDeal())
  await vi.advanceTimersByTimeAsync(400)
  expect(await task).toHaveProperty('valuation_assessment')
  expect(cache.get.mock.calls[0]![1].aborted).toBe(true)
  expect(cache.set.mock.calls[0]![3].aborted).toBe(true)
})

it.each(['error', 'json', 'truncated', 'unsupported', 'unavailable'] as const)('does not cache %s model failures and permits a later successful retry', async (failure) => {
  const { cache } = fakeCache()
  const transport = vi.fn<AnalysisTransport>().mockImplementationOnce(async (request) => {
    if (failure === 'error') throw new Error('private provider error')
    const success = await successfulAnalysis(request)
    if (failure === 'truncated') return { ...success, stopReason: 'max_tokens' }
    return { ...success, text: failure === 'json' ? 'broken' : failure === 'unavailable' ? '{"status":"unavailable"}' :
      JSON.stringify({ ...JSON.parse(success.text), key_strengths: ['המבנה שופץ לאחרונה'] }) }
  }).mockImplementation(successfulAnalysis)
  const analyze = createDealAnalyzer(comparableDeals(), cache, logger(), { anthropicApiKey: 'test', analysisTransport: transport })
  expect(await analyze(savedDeal())).toEqual(unavailable)
  expect(cache.set).not.toHaveBeenCalled()
  expect(await analyze(savedDeal())).toHaveProperty('valuation_assessment')
  expect(transport).toHaveBeenCalledTimes(2)
})

it('enforces the end-to-end deadline, aborts ignored cancellation, and discards late results', async () => {
  vi.useFakeTimers()
  const { cache } = fakeCache()
  cache.get.mockImplementation(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); return null })
  let resolve!: (response: Awaited<ReturnType<AnalysisTransport>>) => void
  const transport = vi.fn<AnalysisTransport>(() => new Promise((done) => { resolve = done }))
  const analyze = createDealAnalyzer(comparableDeals(), cache, logger(), { anthropicApiKey: 'test', analysisTransport: transport })
  const pending = analyze(savedDeal())
  await vi.advanceTimersByTimeAsync(10000)
  expect(await pending).toEqual(unavailable)
  expect(transport.mock.calls[0]![0].signal.aborted).toBe(true)
  resolve(await successfulAnalysis(transport.mock.calls[0]![0]))
  await vi.advanceTimersByTimeAsync(1)
  expect(cache.set).not.toHaveBeenCalled()
})

it('bounds cache writes by the overall deadline too', async () => {
  vi.useFakeTimers()
  const { cache } = fakeCache()
  cache.set.mockImplementation(() => new Promise(() => {}))
  const transport: AnalysisTransport = async (request) => {
    await new Promise((resolve) => setTimeout(resolve, 9900))
    return successfulAnalysis(request)
  }
  const pending = createDealAnalyzer(comparableDeals(), cache, logger(), { anthropicApiKey: 'test', analysisTransport: transport })(savedDeal())
  await vi.advanceTimersByTimeAsync(10000)
  expect(await pending).toEqual(unavailable)
  expect(cache.set.mock.calls[0]![3].aborted).toBe(true)
})

it('bounds non-yielding work with a monotonic elapsed-time check', async () => {
  let elapsed = 0
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
  await expect(withinDeadline(async () => { elapsed = 10001; return true }, 10000)).rejects.toThrow('deadline')
})

it('does not start work when its parent is already aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const operation = vi.fn(async () => true)
  await expect(withinDeadline(operation, 10000, controller.signal)).rejects.toThrow('cancelled')
  expect(operation).not.toHaveBeenCalled()
})
