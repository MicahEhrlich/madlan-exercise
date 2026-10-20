import { afterEach, expect, it, vi } from 'vitest'
import { ApiTimeoutError, runApiRequest } from './runApiRequest'

afterEach(() => vi.useRealTimers())

it('does not start an already cancelled request', async () => {
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  const request = vi.fn()
  await expect(runApiRequest(controller.signal, request, vi.fn())).rejects.toThrow('cancelled')
  expect(request).not.toHaveBeenCalled()
})

it('settles cancellation promptly even if the request ignores its signal', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  let requestSignal!: AbortSignal
  const request = runApiRequest(controller.signal, (signal) => {
    requestSignal = signal
    return new Promise<never>(() => {})
  }, vi.fn())
  const rejected = expect(request).rejects.toThrow('cancelled')
  controller.abort(new Error('cancelled'))
  await rejected
  expect(requestSignal.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('resets the inactivity deadline during processing and ignores late processing after timeout', async () => {
  vi.useFakeTimers()
  let processing!: () => void
  const onProcessing = vi.fn()
  const request = runApiRequest(new AbortController().signal, (_signal, callback) => {
    processing = callback
    return new Promise<never>(() => {})
  }, onProcessing)
  const rejected = expect(request).rejects.toBeInstanceOf(ApiTimeoutError)
  await vi.advanceTimersByTimeAsync(9000)
  processing()
  await vi.advanceTimersByTimeAsync(9000)
  expect(onProcessing).toHaveBeenCalledTimes(1)
  expect(onProcessing.mock.calls[0]![0].aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1000)
  await rejected
  processing()
  expect(onProcessing).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('cleans up timeout and cancellation listeners after success and synchronous failure', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  const remove = vi.spyOn(controller.signal, 'removeEventListener')
  await expect(runApiRequest(controller.signal, async () => 'ready', vi.fn())).resolves.toBe('ready')
  await expect(runApiRequest(controller.signal, () => { throw new Error('broken') }, vi.fn())).rejects.toThrow('broken')
  expect(remove).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})
