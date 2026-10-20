export class ApiTimeoutError extends Error {
  constructor() { super('API request timed out'); this.name = 'ApiTimeoutError' }
}

/** Bound inactive requests, even when the transport ignores cancellation. */
export async function runApiRequest<T>(
  signal: AbortSignal,
  request: (signal: AbortSignal, onProcessing: () => void) => Promise<T>,
  onProcessing: (signal: AbortSignal) => void,
): Promise<T> {
  signal.throwIfAborted()
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let active = true
  let rejectRequest!: (reason: unknown) => void
  const interrupted = new Promise<never>((_resolve, reject) => { rejectRequest = reject })
  const cancel = () => { controller.abort(signal.reason); rejectRequest(signal.reason) }
  const resetTimeout = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const error = new ApiTimeoutError()
      active = false
      controller.abort(error)
      rejectRequest(error)
    }, 10000)
  }
  signal.addEventListener('abort', cancel, { once: true })
  resetTimeout()
  try {
    return await Promise.race([
      request(controller.signal, () => {
        if (!active || controller.signal.aborted) return
        resetTimeout()
        onProcessing(controller.signal)
      }),
      interrupted,
    ])
  } finally {
    active = false
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
    controller.abort()
  }
}
