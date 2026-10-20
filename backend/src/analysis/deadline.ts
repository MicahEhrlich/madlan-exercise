/** Bounds even injected operations that ignore cancellation, and propagates parent aborts. */
export async function withinDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  const started = performance.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort!: () => void
  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      abort = () => {
        controller.abort()
        reject(new Error('Analysis operation cancelled or timed out'))
      }
      timer = setTimeout(abort, timeoutMs)
      parent?.addEventListener('abort', abort, { once: true })
      if (parent?.aborted) abort()
    })
    if (controller.signal.aborted) return await deadline
    const result = await Promise.race([operation(controller.signal), deadline])
    if (performance.now() - started >= timeoutMs) {
      controller.abort()
      throw new Error('Analysis deadline exceeded')
    }
    return result
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', abort)
  }
}
