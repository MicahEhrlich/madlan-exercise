// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import DealsTable from './DealsTable'
import { mockDeals } from '../data/mockDeals'

const fetchMock = vi.fn<typeof fetch>()
const response = (page = 1, count = 20) => ({
  page, count, total: 21, total_pages: Math.ceil(21 / count), rows: page === 1 ? [mockDeals[0]] : [mockDeals[1]],
})
const ok = (data = response()) => new Response(JSON.stringify(data))

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('shows processing and polls through a long import until results become available', async () => {
  vi.useFakeTimers()
  let requests = 0
  fetchMock.mockImplementation(async () => ++requests <= 16
    ? new Response(JSON.stringify({ status: 'processing', message: 'הנתונים עדיין בעיבוד.' }), { status: 202, headers: { 'Retry-After': '2' } })
    : ok())
  render(<DealsTable />)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByRole('status').textContent).toContain('הנתונים עדיין בעיבוד')
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('status').textContent).toContain('הנתונים עדיין בעיבוד')
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(screen.getByText('תל אביב–יפו', { selector: 'bdi' })).toBeDefined()
  expect(screen.queryByText(/הנתונים עדיין בעיבוד/)).toBeNull()
})

it('shows a real import failure when processing ends with HTTP 503', async () => {
  vi.useFakeTimers()
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'processing' }), { status: 202 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'error' }), { status: 503 }))
  render(<DealsTable />)
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(screen.getByRole('alert').textContent).toContain('לא ניתן לטעון')
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('loads the default page, navigates, and resets pagination when page size changes', async () => {
  fetchMock.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok(response(2))).mockResolvedValueOnce(ok(response(1, 50)))
  render(<DealsTable />)
  expect(screen.getByRole('status').textContent).toBe('טוען עסקאות…')
  await screen.findByText('תל אביב–יפו', { selector: 'bdi' })
  expect(fetchMock.mock.calls[0]![0]).toBe('/deals?page=1&count=20')
  expect((screen.getByRole('button', { name: 'העמוד הקודם' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'העמוד הבא' }))
  await screen.findByText('רמת גן', { selector: 'bdi' })
  expect(fetchMock.mock.calls[1]![0]).toBe('/deals?page=2&count=20')
  expect((screen.getByRole('button', { name: 'העמוד הבא' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('עסקאות בעמוד'), { target: { value: '50' } })
  await screen.findByText('תל אביב–יפו', { selector: 'bdi' })
  expect(fetchMock.mock.calls[2]![0]).toBe('/deals?page=1&count=50')
})

it('returns to the previous page', async () => {
  fetchMock.mockImplementation(async (input) => ok(response(String(input).includes('page=2') ? 2 : 1)))
  render(<DealsTable />)
  await screen.findByText('תל אביב–יפו', { selector: 'bdi' })
  fireEvent.click(screen.getByRole('button', { name: 'העמוד הבא' }))
  await screen.findByText('רמת גן', { selector: 'bdi' })
  fireEvent.click(screen.getByRole('button', { name: 'העמוד הקודם' }))
  await screen.findByText('תל אביב–יפו', { selector: 'bdi' })
})

it('shows a useful empty state without enabling pagination', async () => {
  fetchMock.mockResolvedValue(ok({ page: 1, count: 20, total: 0, total_pages: 0, rows: [] }))
  render(<DealsTable />)
  await screen.findByText('לא נמצאו עסקאות התואמות לחיפוש ולמסננים.')
  expect(screen.getByText('0 עסקאות')).toBeDefined()
  expect((screen.getByRole('button', { name: 'העמוד הבא' }) as HTMLButtonElement).disabled).toBe(true)
})

it.each(['network', 'http', 'invalid', 'json'] as const)('shows an error and supports retry after %s failure', async (failure) => {
  if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('offline'))
  else if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))
  else fetchMock.mockResolvedValueOnce(new Response(failure === 'json' ? 'broken json' : '{}'))
  fetchMock.mockResolvedValueOnce(ok())
  render(<DealsTable />)
  expect((await screen.findByRole('alert')).textContent).toContain('לא ניתן לטעון את העסקאות')
  expect(screen.queryByRole('table')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'ניסיון נוסף' }))
  await screen.findByText('תל אביב–יפו', { selector: 'bdi' })
})

it('times out even if fetch ignores cancellation, and ignores a late success', async () => {
  vi.useFakeTimers()
  let resolve!: (value: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  render(<DealsTable />)
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  expect(screen.getByRole('alert').textContent).toContain('ארכה זמן רב מדי')
  expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true)
  await act(async () => { resolve(ok()) })
  expect(screen.queryByRole('table')).toBeNull()
})

it('aborts pending requests on unmount and ignores late failures', async () => {
  let reject!: (reason: Error) => void
  fetchMock.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  const view = render(<DealsTable />)
  view.unmount()
  expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true)
  await act(async () => { reject(new Error('aborted')) })
})

it('recovers on retry while an older timed-out request is still pending', async () => {
  vi.useFakeTimers()
  let resolve!: (value: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done })).mockResolvedValueOnce(ok())
  render(<DealsTable />)
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  vi.useRealTimers()
  fireEvent.click(screen.getByRole('button', { name: 'ניסיון נוסף' }))
  await screen.findByText('תל אביב–יפו', { selector: 'bdi' })
  await act(async () => { resolve(ok(response(2))) })
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(screen.queryByText('רמת גן', { selector: 'bdi' })).toBeNull()
})

it('preserves server filters across pages and page-size changes and resets the page when a filter changes', async () => {
  fetchMock.mockImplementation(async (input) => {
    const params = new URL(String(input), 'http://localhost').searchParams
    const page = Number(params.get('page'))
    const count = Number(params.get('count'))
    return new Response(JSON.stringify({ page, count, total: 41, total_pages: Math.ceil(41 / count), rows: [mockDeals[0]] }))
  })
  const loaded = () => waitFor(() => {
    expect(screen.queryByText('טוען עסקאות…')).toBeNull()
    expect(screen.getByText('תל אביב–יפו', { selector: 'bdi' })).toBeDefined()
  })
  const lastQuery = () => new URL(String(fetchMock.mock.lastCall![0]), 'http://localhost').searchParams
  render(<DealsTable />)
  await loaded()
  fireEvent.change(screen.getByLabelText('סינון לפי עיר'), { target: { value: 'תל אביב–יפו' } })
  await loaded()
  expect(lastQuery().get('city')).toBe('תל אביב–יפו')
  fireEvent.click(screen.getByRole('button', { name: 'העמוד הבא' }))
  await loaded()
  expect(lastQuery().get('page')).toBe('2')
  expect(lastQuery().get('city')).toBe('תל אביב–יפו')
  expect((screen.getByLabelText('סינון לפי עיר') as HTMLSelectElement).value).toBe('תל אביב–יפו')
  fireEvent.change(screen.getByLabelText('סינון לפי חניה'), { target: { value: 'false' } })
  await loaded()
  expect(lastQuery().get('page')).toBe('1')
  expect(lastQuery().get('has_parking')).toBe('false')
  expect(lastQuery().get('city')).toBe('תל אביב–יפו')
  fireEvent.click(screen.getByRole('button', { name: 'העמוד הבא' }))
  await loaded()
  expect(lastQuery().get('has_parking')).toBe('false')
  fireEvent.change(screen.getByLabelText('עסקאות בעמוד'), { target: { value: '50' } })
  await loaded()
  expect(lastQuery().get('count')).toBe('50')
  expect(lastQuery().get('page')).toBe('1')
  expect(lastQuery().get('city')).toBe('תל אביב–יפו')
  expect(lastQuery().get('has_parking')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: 'ניקוי חיפוש ומסננים' }))
  await loaded()
  expect([...lastQuery().keys()]).toEqual(['page', 'count'])
  expect((screen.getByLabelText('סינון לפי עיר') as HTMLSelectElement).value).toBe('')
})

it('retains a selected filter through empty results so it can be cleared', async () => {
  fetchMock.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok({ page: 1, count: 20, total: 0, total_pages: 0, rows: [] })).mockResolvedValueOnce(ok())
  render(<DealsTable />)
  await screen.findByText('תל אביב–יפו', { selector: 'bdi' })
  fireEvent.change(screen.getByLabelText('סינון לפי עיר'), { target: { value: 'תל אביב–יפו' } })
  await screen.findByText('לא נמצאו עסקאות התואמות לחיפוש ולמסננים.')
  expect((screen.getByLabelText('סינון לפי עיר') as HTMLSelectElement).value).toBe('תל אביב–יפו')
  fireEvent.change(screen.getByLabelText('סינון לפי עיר'), { target: { value: '' } })
  await screen.findByText('תל אביב–יפו', { selector: 'bdi' })
  expect(String(fetchMock.mock.lastCall![0])).toBe('/deals?page=1&count=20')
})

it('updates page totals and navigation from filtered results and searches before pagination', async () => {
  fetchMock.mockImplementation(async (input) => {
    const params = new URL(String(input), 'http://localhost').searchParams
    const page = Number(params.get('page'))
    const count = Number(params.get('count'))
    const total = params.has('q') ? 1 : params.has('city') ? 21 : 101
    return new Response(JSON.stringify({ page, count, total, total_pages: Math.ceil(total / count), rows: [mockDeals[0]] }))
  })
  const loaded = () => waitFor(() => expect(screen.queryByText('טוען עסקאות…')).toBeNull())
  render(<DealsTable />)
  await loaded()
  expect(screen.getByText('עמוד 1 מתוך 6 · 101 עסקאות')).toBeDefined()
  fireEvent.change(screen.getByLabelText('סינון לפי עיר'), { target: { value: 'תל אביב–יפו' } })
  await loaded()
  expect(screen.getByText('עמוד 1 מתוך 2 · 21 עסקאות')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'העמוד הבא' }))
  await loaded()
  expect(screen.getByText('עמוד 2 מתוך 2 · 21 עסקאות')).toBeDefined()
  const search = screen.getByRole('searchbox')
  search.focus()
  fireEvent.change(search, { target: { value: 'דיזנגוף' } })
  expect(screen.getByRole('searchbox')).toBe(search)
  await screen.findByText('עמוד 1 מתוך 1 · 1 עסקאות')
  expect((screen.getByRole('button', { name: 'העמוד הבא' }) as HTMLButtonElement).disabled).toBe(true)
  const params = new URL(String(fetchMock.mock.lastCall![0]), 'http://localhost').searchParams
  expect(params.get('q')).toBe('דיזנגוף')
  expect(params.get('city')).toBe('תל אביב–יפו')
  expect(params.get('page')).toBe('1')
  expect(document.body.textContent).not.toMatch(/בסך הכ[ול]ל/)
  fireEvent.click(screen.getByRole('button', { name: 'ניקוי חיפוש ומסננים' }))
  await loaded()
  expect(screen.getByText('עמוד 1 מתוך 6 · 101 עסקאות')).toBeDefined()
})

it('waits 500ms after the last keystroke and resets pagination in the same request', async () => {
  fetchMock.mockImplementation(async (input) => {
    const params = new URL(String(input), 'http://localhost').searchParams
    return ok(response(Number(params.get('page'))))
  })
  render(<DealsTable />)
  await screen.findByText('תל אביב–יפו', { selector: 'bdi' })
  fireEvent.click(screen.getByRole('button', { name: 'העמוד הבא' }))
  await screen.findByText('רמת גן', { selector: 'bdi' })
  vi.useFakeTimers()
  const search = screen.getByRole('searchbox') as HTMLInputElement
  fireEvent.change(search, { target: { value: 'ת' } })
  expect(search.value).toBe('ת')
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  fireEvent.change(search, { target: { value: 'תל' } })
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  fireEvent.change(search, { target: { value: 'תל אביב' } })
  await act(async () => { await vi.advanceTimersByTimeAsync(499) })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(fetchMock).toHaveBeenCalledTimes(3)
  const params = new URL(String(fetchMock.mock.lastCall![0]), 'http://localhost').searchParams
  expect(params.get('q')).toBe('תל אביב')
  expect(params.get('page')).toBe('1')
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

it('cancels a pending search when resetting and when unmounting', async () => {
  fetchMock.mockImplementation(async () => ok())
  const view = render(<DealsTable />)
  await screen.findByText('תל אביב–יפו', { selector: 'bdi' })
  vi.useFakeTimers()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'חיפה' } })
  await act(async () => { await vi.advanceTimersByTimeAsync(250) })
  fireEvent.click(screen.getByRole('button', { name: 'ניקוי חיפוש ומסננים' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(500) })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ירושלים' } })
  view.unmount()
  await act(async () => { await vi.advanceTimersByTimeAsync(500) })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('preserves filters through a failed request and retry', async () => {
  fetchMock.mockResolvedValueOnce(ok()).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ok())
  render(<DealsTable />)
  await screen.findByText('תל אביב–יפו', { selector: 'bdi' })
  fireEvent.change(screen.getByLabelText('סינון לפי סטטוס רשומה'), { target: { value: 'original' } })
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'ניסיון נוסף' }))
  await screen.findByText('תל אביב–יפו', { selector: 'bdi' })
  expect(String(fetchMock.mock.lastCall![0])).toContain('row_status=original')
  expect((screen.getByLabelText('סינון לפי סטטוס רשומה') as HTMLSelectElement).value).toBe('original')
})
