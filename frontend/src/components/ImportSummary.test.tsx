// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithQuery as render } from '../../test/renderWithQuery'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ImportSummary from './ImportSummary'
import App from '../App'
import { mockDeals } from '../data/mockDeals'

const fetchMock = vi.fn<typeof fetch>()
const summary = { total_rows: 1530, parsed_rows: 1510, completed_rows: 100 }
const ok = () => new Response(JSON.stringify(summary))
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('keeps the summary in processing state during a long import and polls until it is ready', async () => {
  vi.useFakeTimers()
  let requests = 0
  fetchMock.mockImplementation(async () => ++requests <= 7
    ? new Response(JSON.stringify({ status: 'processing' }), { status: 202 }) : ok())
  render(<ImportSummary />)
  await act(async () => { await vi.advanceTimersByTimeAsync(12000) })
  expect(screen.getByRole('status').textContent).toContain('הנתונים עדיין בעיבוד')
  expect(screen.queryByRole('alert')).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(2001) })
  expect(screen.getByText('1,510 מתוך 1,530')).toBeDefined()
})

it('shows global parsed and completed counts and fetches only once across rerenders', async () => {
  fetchMock.mockResolvedValue(ok())
  const view = render(<ImportSummary />)
  expect(screen.getByRole('status').textContent).toContain('טוען סיכום')
  await screen.findByText('1,510 מתוך 1,530')
  expect(screen.getByText('100', { selector: 'dd' })).toBeDefined()
  expect(screen.getByText('רשומות שבהן הושלמו נתונים על ידי המערכת')).toBeDefined()
  expect(screen.getByText(/רשומות שתוקנו גם עם ערכים לא ידועים נספרות כהשלמה/)).toBeDefined()
  expect(fetchMock).toHaveBeenCalledWith('/deals/summary', { signal: expect.any(AbortSignal) })
  view.rerender(<ImportSummary />)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('displays zero counts without inferring missing values', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ total_rows: 0, parsed_rows: 0, completed_rows: 0 })))
  render(<ImportSummary />)
  await screen.findByText('0 מתוך 0')
  expect(screen.getByText('0')).toBeDefined()
})

it.each(['http', 'network', 'json', 'invalid'] as const)('shows an independent error and retries after %s failure', async (failure) => {
  if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('offline'))
  else fetchMock.mockResolvedValueOnce(failure === 'http' ? new Response('', { status: 503 }) : new Response(failure === 'json' ? 'broken' : '{}'))
  fetchMock.mockResolvedValueOnce(ok())
  render(<ImportSummary />)
  expect((await screen.findByRole('alert')).textContent).toContain('לא ניתן לטעון')
  fireEvent.click(screen.getByRole('button', { name: 'טעינת הסיכום מחדש' }))
  await screen.findByText('1,510 מתוך 1,530')
})

it('times out a stalled summary and ignores a late response', async () => {
  vi.useFakeTimers()
  let resolve!: (value: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  render(<ImportSummary />)
  await act(async () => { await vi.advanceTimersByTimeAsync(10001) })
  expect(screen.getByRole('alert')).toBeDefined()
  expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true)
  await act(async () => { resolve(ok()) })
  expect(screen.queryByText('1,510 מתוך 1,530')).toBeNull()
})

it('cancels the summary on unmount and ignores a late failure', async () => {
  let reject!: (value: Error) => void
  fetchMock.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  const view = render(<ImportSummary />)
  view.unmount()
  expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true)
  await act(async () => { reject(new Error('aborted')) })
})

it('keeps import counts unchanged when table filters and pages change', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
  fetchMock.mockImplementation(async (input) => {
    if (String(input) === '/deals/summary') return ok()
    const params = new URL(String(input), 'http://localhost').searchParams
    const page = Number(params.get('page'))
    const count = Number(params.get('count'))
    const total = params.has('city') ? 21 : 510
    return new Response(JSON.stringify({ page, count, total, total_pages: Math.ceil(total / count), rows: [mockDeals[0]] }))
  })
  render(<App />)
  await screen.findByText('1,510 מתוך 1,530')
  await screen.findByText('תל אביב–יפו', { selector: 'bdi' })
  fireEvent.change(screen.getByLabelText('סינון לפי עיר'), { target: { value: 'תל אביב–יפו' } })
  await screen.findByText('עמוד 1 מתוך 2 · 21 עסקאות')
  fireEvent.click(screen.getByRole('button', { name: 'העמוד הבא' }))
  await screen.findByText('עמוד 2 מתוך 2 · 21 עסקאות')
  expect(screen.getByText('1,510 מתוך 1,530')).toBeDefined()
  expect(screen.getByText('100', { selector: 'dd' })).toBeDefined()
  expect(fetchMock.mock.calls.filter(([input]) => input === '/deals/summary')).toHaveLength(1)
  await waitFor(() => expect(screen.queryByText('טוען עסקאות…')).toBeNull())
})
