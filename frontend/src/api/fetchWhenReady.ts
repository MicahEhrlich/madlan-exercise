import { apiUrl } from './apiUrl'

function waitForRetry(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, delay)
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** Processing is a normal startup state. Poll until ready, failed, or cancelled. */
export async function fetchWhenReady(url: string, signal: AbortSignal, onProcessing: () => void): Promise<Response> {
  while (!signal.aborted) {
    const response = await fetch(apiUrl(url), { signal })
    if (response.status !== 202) return response
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || !('status' in body) || body.status !== 'processing') {
      throw new Error('Invalid processing response')
    }
    onProcessing()
    const seconds = Number(response.headers.get('Retry-After'))
    const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(5000, Math.max(1000, seconds * 1000)) : 2000
    await waitForRetry(delay, signal)
  }
  throw signal.reason
}
