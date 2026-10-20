import { afterEach, expect, it, vi } from 'vitest'
import { createRepairSession, estimateOutputTokens } from '../src/repairs/repairSession.js'
import type { RepairRequest, RepairResponse, RepairTransport } from '../src/repairs/types.js'
import { candidate, proposed, report, response } from './repairFixtures.js'

function session(transport?: RepairTransport, extra = {}) {
  const logger = { info: vi.fn(), warn: vi.fn() }
  const accept = vi.fn()
  const reject = vi.fn()
  const service = createRepairSession(logger, { anthropicApiKey: 'test-key', repairTransport: transport, ...extra }, accept, reject)
  return { ...service, accept, reject, logger }
}
const succeed = ({ candidates }: RepairRequest) => Promise.resolve(response(report(candidates.map((row) => proposed(row)))))
afterEach(() => vi.useRealTimers())

it('makes no calls without credentials and rejects unresolved rows', async () => {
  const transport = vi.fn(succeed)
  const service = session(transport, { anthropicApiKey: undefined })
  await service.enqueue(candidate())
  await service.flush()
  expect(transport).not.toHaveBeenCalled()
  expect(service.reject).toHaveBeenCalledTimes(1)
  expect(service.logger.info).toHaveBeenCalledWith({ repairEnabled: false }, expect.any(String))
})

it('enforces row limit, flushes remaining rows, and records actual usage', async () => {
  const transport = vi.fn(succeed)
  const service = session(transport, { llmBatchSize: 2, anthropicModel: 'configured-model' })
  await service.enqueue(candidate())
  expect(service.hasPendingDeal(candidate().original)).toBe(true)
  expect(transport).not.toHaveBeenCalled()
  await service.enqueue(candidate({ deal_id: 'D2' }, 3))
  expect(transport).toHaveBeenCalledTimes(1)
  await service.enqueue(candidate({ deal_id: 'D3' }, 4))
  expect(await service.flush()).toMatchObject({ auto_corrected: 1, rows_failed_to_correct: 0 })
  expect(service.accept).toHaveBeenCalledTimes(3)
  expect(transport.mock.calls[0]![0].model).toBe('configured-model')
  expect(service.logger.info).toHaveBeenCalledWith(expect.objectContaining({ usage: { input_tokens: 100, output_tokens: 50 }, elapsedMs: expect.any(Number) }), 'CSV repair API usage')
})

it('reduces group size for the output budget and isolates repeated IDs', async () => {
  const transport = vi.fn(succeed)
  const service = session(transport, { llmBatchSize: 100 })
  for (let index = 0; index < 8; index++) await service.enqueue(candidate({ deal_id: `D${index}` }))
  await service.flush()
  expect(transport.mock.calls.length).toBeGreaterThan(1)
  for (const [request] of transport.mock.calls) {
    expect(request.candidates.reduce((sum, row) => sum + estimateOutputTokens(row), 0)).toBeLessThanOrEqual(2048 - 256)
  }
  const repeated = session(transport)
  await repeated.enqueue(candidate())
  await repeated.enqueue(candidate())
  await repeated.flush()
  expect(repeated.accept).toHaveBeenCalledTimes(2)
})

it('keeps source lookups and ordinary representation repairs in separate requests', async () => {
  const transport = vi.fn(async ({ candidates }: RepairRequest) => response(report([], candidates.map((row) => row.original))))
  const service = session(transport)
  await service.enqueue(candidate())
  await service.enqueue(candidate({ deal_id: 'lookup', year_built: '' }))
  await service.enqueue(candidate({ deal_id: 'ordinary' }))
  await service.flush()
  expect(transport.mock.calls.map(([request]) => request.candidates.map((row) => row.original.deal_id))).toEqual([['D1'], ['lookup'], ['ordinary']])
})

it('fails oversized individual rows locally without calling the API', async () => {
  const transport = vi.fn(succeed)
  const service = session(transport)
  await service.enqueue(candidate({ street: 'a'.repeat(5000) }))
  expect(transport).not.toHaveBeenCalled()
  expect(service.reject).toHaveBeenCalledWith(expect.any(Object), 'Row exceeds LLM output budget')
})

it('aborts at 10 seconds even when a transport never settles', async () => {
  vi.useFakeTimers()
  let signal: AbortSignal | undefined
  const transport = vi.fn(({ signal: requestSignal }: RepairRequest) => {
    signal = requestSignal
    return new Promise<RepairResponse>(() => {})
  })
  const service = session(transport, { llmBatchSize: 1 })
  const pending = service.enqueue(candidate())
  await vi.advanceTimersByTimeAsync(9999)
  expect(service.reject).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  await pending
  expect(signal!.aborted).toBe(true)
  expect(service.reject).toHaveBeenCalledTimes(1)
  await service.enqueue(candidate({ deal_id: 'D2' }))
  expect(transport).toHaveBeenCalledTimes(1)
  expect(service.accept).not.toHaveBeenCalled()
})

it('caps total API work at 30 seconds and gives the final request only the remaining time', async () => {
  vi.useFakeTimers()
  const signals: AbortSignal[] = []
  const transport = vi.fn((request: RepairRequest) => {
    signals.push(request.signal)
    return new Promise<RepairResponse>((resolve) => {
      const timer = setTimeout(() => resolve(response(report(request.candidates.map((row) => proposed(row))))), 9000)
      request.signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
    })
  })
  const service = session(transport, { llmBatchSize: 1 })
  for (let index = 0; index < 3; index++) {
    const pending = service.enqueue(candidate({ deal_id: `D${index}` }))
    await vi.advanceTimersByTimeAsync(9000)
    await pending
  }
  const final = service.enqueue(candidate({ deal_id: 'D3' }))
  await vi.advanceTimersByTimeAsync(2999)
  expect(service.reject).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  await final
  expect(signals[3]!.aborted).toBe(true)
  expect(service.accept).toHaveBeenCalledTimes(3)
  await service.enqueue(candidate({ deal_id: 'D4' }))
  expect(transport).toHaveBeenCalledTimes(4)
})

it('does not retry failures or leak transport error contents into logs', async () => {
  const transport = vi.fn(async () => { throw new Error('sensitive-test-secret') })
  const service = session(transport, { llmBatchSize: 1 })
  await service.enqueue(candidate())
  await service.enqueue(candidate({ deal_id: 'D2' }))
  expect(transport).toHaveBeenCalledTimes(1)
  expect(service.reject).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(service.logger.warn.mock.calls)).not.toContain('sensitive-test-secret')
})

it.each(['max_tokens', 'refusal', 'pause_turn'])('rejects partial output with stop reason %s', async (stopReason) => {
  const row = candidate()
  const service = session(async () => response(report([proposed(row)]), stopReason), { llmBatchSize: 1 })
  await service.enqueue(row)
  expect(service.accept).not.toHaveBeenCalled()
  expect(service.reject).toHaveBeenCalledTimes(1)
})

it('fails invalid responses without retrying and can process the next group', async () => {
  const transport = vi.fn(succeed).mockResolvedValueOnce(response('{'))
  const service = session(transport, { llmBatchSize: 1 })
  await service.enqueue(candidate())
  await service.enqueue(candidate({ deal_id: 'D2' }))
  expect(transport).toHaveBeenCalledTimes(2)
  expect(service.accept).toHaveBeenCalledTimes(1)
  expect(service.reject).toHaveBeenCalledTimes(1)
})

it('handles explicit failures and replaces unsupported proposals with failed originals', async () => {
  const service = session(async ({ candidates }) => response(report([], candidates.map((row) => row.original))), { llmBatchSize: 1 })
  await service.enqueue(candidate())
  expect(service.accept).not.toHaveBeenCalled()
  expect(service.reject).toHaveBeenCalledTimes(1)
  const unsupported = session(async ({ candidates }) => response(report(candidates.map((row) => proposed(row, { city: 'changed' })))), { llmBatchSize: 1 })
  await unsupported.enqueue(candidate())
  expect(unsupported.accept).not.toHaveBeenCalled()
})

it('rejects invalid LLM batch settings', () => {
  expect(() => session(succeed, { llmBatchSize: 0 })).toThrow('LLM_BATCH_SIZE must be a positive safe integer')
})

it('rejects the next queued candidate if a token-limit flush disables the service', async () => {
  const transport = vi.fn(async () => { throw new Error('unavailable') })
  const service = session(transport, { llmBatchSize: 100 })
  await service.enqueue(candidate({ street: 'a'.repeat(600) }))
  await service.enqueue(candidate({ deal_id: 'D2', street: 'b'.repeat(600) }))
  expect(transport).toHaveBeenCalledTimes(1)
  expect(service.reject).toHaveBeenCalledTimes(2)
  expect(service.hasPendingDeal(candidate({ deal_id: 'D2' }).original)).toBe(false)
})

it('rejects a late completion even if the event loop has not delivered the timeout callback yet', async () => {
  let elapsed = 0
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
  let signal: AbortSignal | undefined
  try {
    const service = session(async (request) => {
      signal = request.signal
      elapsed = 10001
      return response(report(request.candidates.map((row) => proposed(row))))
    }, { llmBatchSize: 1 })
    await service.enqueue(candidate())
    expect(signal!.aborted).toBe(true)
    expect(service.accept).not.toHaveBeenCalled()
    expect(service.reject).toHaveBeenCalledTimes(1)
  } finally { clock.mockRestore() }
})
