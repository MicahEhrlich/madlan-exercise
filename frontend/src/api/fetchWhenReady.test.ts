import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fetchWhenReady } from './fetchWhenReady'

const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it.each([
  [undefined, 2000], ['0', 2000], ['invalid', 2000], ['0.1', 1000], ['500', 5000], ['2', 2000],
] as const)('polls after Retry-After %s with bounded delay %s', async (header, delay) => {
  const headers = header ? { 'Retry-After': header } : undefined
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'processing' }), { status: 202, headers }))
    .mockResolvedValueOnce(new Response('ready'))
  const processing = vi.fn()
  const signal = new AbortController().signal
  const result = fetchWhenReady('/deals?city=test&page=2', signal, processing)
  await vi.advanceTimersByTimeAsync(0)
  expect(processing).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(delay - 1)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(await (await result).text()).toBe('ready')
  expect(fetchMock.mock.calls[1]).toEqual(['/deals?city=test&page=2', { signal }])
})

it.each([null, {}, { status: 'invalid' }, 'processing'])('rejects malformed 202 bodies: %j', async (body) => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 202 }))
  await expect(fetchWhenReady('/deals', new AbortController().signal, vi.fn())).rejects.toThrow('Invalid processing response')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('cancels pending polls immediately when aborted', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'processing' }), { status: 202 }))
  const controller = new AbortController()
  const result = fetchWhenReady('/deals', controller.signal, vi.fn())
  const rejected = expect(result).rejects.toThrow('cancelled')
  await vi.advanceTimersByTimeAsync(0)
  controller.abort(new Error('cancelled'))
  await rejected
  await vi.advanceTimersByTimeAsync(5000)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('does not request or schedule retries after cancellation', async () => {
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  await expect(fetchWhenReady('/deals', controller.signal, vi.fn())).rejects.toThrow('cancelled')
  expect(fetchMock).not.toHaveBeenCalled()
  const second = new AbortController()
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'processing' }), { status: 202 }))
  await expect(fetchWhenReady('/deals', second.signal, () => second.abort(new Error('cancelled')))).rejects.toThrow('cancelled')
})
