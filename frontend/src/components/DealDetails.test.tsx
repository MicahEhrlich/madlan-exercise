// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { renderWithQuery as render } from '../../test/renderWithQuery'
import DealsTableView from './DealsTableView'
import DealDetails from './DealDetails'
import DealAnalysis from './DealAnalysis'
import DealsTable from './DealsTable'
import { mockDeals } from '../data/mockDeals'
import type { PropertyDeal } from '../types/propertyDeal'

const analysis = { valuation_assessment: 'Undervalued', estimated_discount_premium_pct: -12,
  key_strengths: ['מחיר נמוך ביחס לנתונים'], risk_factors: ['ההשוואה מבוססת על הנתונים שנקלטו בלבד'] }
const fetchMock = vi.fn<typeof fetch>()
const ok = (data: unknown = analysis) => new Response(JSON.stringify(data))
const tableProps = { deals: mockDeals, total: 4, query: '', filters: {}, onQueryChange: vi.fn(),
  onFilterChange: vi.fn(), onRangeApply: vi.fn(), onReset: vi.fn(), onPresetToggle: vi.fn() }
const toggle = (id = 'row-2') => screen.getByRole('button', { name: `פתיחת פרטי העסקה ${id}` })
const panel = () => screen.getByRole('region', { name: 'פרטי העסקה' })
beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(async () => ok())
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('opens from a row click, shows all basic fields, and toggles without closing on content clicks', async () => {
  render(<DealsTableView {...tableProps} />)
  expect(fetchMock).not.toHaveBeenCalled()
  fireEvent.click(toggle().closest('tr')!)
  expect(panel()).toBeDefined()
  for (const label of ['עיר', 'רחוב', 'שכונה', 'שנת בנייה', 'חדרים', 'שטח', 'מחיר', 'מחיר למ״ר']) {
    expect(within(panel()).getByText(label, { selector: 'dt' })).toBeDefined()
  }
  expect(within(panel()).getByText('80 מ״ר')).toBeDefined()
  expect(within(panel()).getByText('4,000,000 ₪')).toBeDefined()
  expect(within(panel()).getByText('50,000 ₪')).toBeDefined()
  await within(panel()).findByText('מתחת לטווח ההשוואה')
  expect(fetchMock).toHaveBeenCalledWith('/deals/row-2/analysis', { signal: expect.any(AbortSignal) })
  fireEvent.click(within(panel()).getByText('פרטי העסקה', { selector: 'h3' }))
  expect(panel()).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'סגירת פרטי העסקה row-2' }).closest('tr')!)
  expect(screen.queryByRole('region', { name: 'פרטי העסקה' })).toBeNull()
})

it('has one open row, an accessible toggle, and restores focus on close', async () => {
  render(<DealsTableView {...tableProps} />)
  const button = toggle()
  button.focus()
  // Native button activation provides keyboard support without custom key handlers.
  fireEvent.click(button)
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(panel().id).toBe(button.getAttribute('aria-controls'))
  await within(panel()).findByText('מתחת לטווח ההשוואה')
  fireEvent.click(screen.getByRole('button', { name: 'סגירת פרטי העסקה' }))
  expect(document.activeElement).toBe(button)
  expect(button.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(button)
  fireEvent.click(toggle('row-3'))
  expect(screen.getAllByRole('region', { name: 'פרטי העסקה' })).toHaveLength(1)
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(within(panel()).getByText('רמת גן')).toBeDefined()
  await within(panel()).findByText('מתחת לטווח ההשוואה')
})

it.each([
  { street: '', neighborhood: '' }, { street: '  ', neighborhood: ' UnKnOwN ' },
  { street: undefined, neighborhood: undefined },
])('blocks requests when both local fields are unknown: %j', (missing) => {
  const deal = { ...mockDeals[0], ...missing } as PropertyDeal
  render(<DealDetails deal={deal} id="details" onClose={vi.fn()} />)
  expect(screen.getByText('לא ניתן לנתח את העסקה ללא רחוב או שכונה ידועים.')).toBeDefined()
  expect(screen.getAllByText('לא ידוע')).toHaveLength(2)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(screen.queryByText('מנתח עסקה')).toBeNull()
})

it.each([{ street: 'unknown' }, { neighborhood: ' UNKNOWN ' }])('requests analysis with one known local field: %j', async (missing) => {
  render(<DealDetails deal={{ ...mockDeals[0], ...missing }} id="details" onClose={vi.fn()} />)
  await screen.findByText('מתחת לטווח ההשוואה')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('shows the exact loading text and reduced-motion spinner, cancels on switching, and ignores late responses', async () => {
  let resolve!: (value: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  render(<DealsTableView {...tableProps} />)
  fireEvent.click(toggle())
  const status = within(panel()).getByRole('status')
  expect(status.textContent).toBe('מנתח עסקה')
  expect(status.querySelector('[aria-hidden]')!.className).toContain('motion-reduce:animate-none')
  const signal = fetchMock.mock.calls[0]![1]!.signal!
  fireEvent.click(toggle('row-3'))
  expect(signal.aborted).toBe(true)
  await within(panel()).findByText('מתחת לטווח ההשוואה')
  await act(async () => { resolve(ok({ ...analysis, key_strengths: ['תוצאה ישנה'] })) })
  expect(screen.queryByText('תוצאה ישנה')).toBeNull()
})

it('cancels a pending request on collapse and fetches again when reopened', async () => {
  fetchMock.mockImplementationOnce(() => new Promise(() => {}))
  render(<DealsTableView {...tableProps} />)
  fireEvent.click(toggle())
  const signal = fetchMock.mock.calls[0]![1]!.signal!
  fireEvent.click(screen.getByRole('button', { name: 'סגירת פרטי העסקה row-2' }))
  expect(signal.aborted).toBe(true)
  fireEvent.click(toggle())
  await within(panel()).findByText('מתחת לטווח ההשוואה')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it.each(['unavailable', 'network', 'http', 'json', 'schema'] as const)('shows %s and allows manual retry without hiding basic data', async (failure) => {
  if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('offline'))
  else fetchMock.mockResolvedValueOnce(failure === 'unavailable' ? ok({ status: 'unavailable' }) :
    failure === 'http' ? new Response('', { status: 503 }) : failure === 'json' ? new Response('{') : ok({}))
  render(<DealDetails deal={mockDeals[0]} id="details" onClose={vi.fn()} />)
  await screen.findByText(failure === 'unavailable' ? 'ניתוח העסקה אינו זמין כרגע.' : 'לא ניתן לטעון את ניתוח העסקה. נסו שוב.')
  expect(screen.getByText('4,000,000 ₪')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'ניסיון נוסף לניתוח' }))
  await screen.findByText('מתחת לטווח ההשוואה')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('handles timeout separately, ignores late success, and permits retry', async () => {
  vi.useFakeTimers()
  let resolve!: (value: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  render(<DealDetails deal={mockDeals[0]} id="details" onClose={vi.fn()} />)
  await act(async () => { await vi.advanceTimersByTimeAsync(10001) })
  expect(screen.getByRole('alert').textContent).toContain('ניתוח העסקה ארך זמן רב מדי')
  expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true)
  await act(async () => { resolve(ok()) })
  expect(screen.queryByText('מתחת לטווח ההשוואה')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'ניסיון נוסף לניתוח' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(screen.getByText('מתחת לטווח ההשוואה')).toBeDefined()
})

it('reuses successful analysis for five minutes and expires it on reopening', async () => {
  vi.useFakeTimers()
  render(<DealsTableView {...tableProps} />)
  fireEvent.click(toggle())
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  fireEvent.click(screen.getByRole('button', { name: 'סגירת פרטי העסקה row-2' }))
  fireEvent.click(toggle())
  expect(screen.getByText('מתחת לטווח ההשוואה')).toBeDefined()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'סגירת פרטי העסקה row-2' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(300001) })
  fireEvent.click(toggle())
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('retries unavailable responses on reopen', async () => {
  fetchMock.mockResolvedValueOnce(ok({ status: 'unavailable' }))
  render(<DealsTableView {...tableProps} />)
  fireEvent.click(toggle())
  await screen.findByText('ניתוח העסקה אינו זמין כרגע.')
  fireEvent.click(screen.getByRole('button', { name: 'סגירת פרטי העסקה row-2' }))
  fireEvent.click(toggle())
  await screen.findByText('מתחת לטווח ההשוואה')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('keys analysis by deal snapshot and API base URL as well as row ID', async () => {
  const view = render(<DealAnalysis deal={mockDeals[0]} />)
  await screen.findByText('מתחת לטווח ההשוואה')
  view.rerender(<DealAnalysis deal={{ ...mockDeals[0], price_nis: 3000000 }} />)
  await screen.findByText('מתחת לטווח ההשוואה')
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
  view.rerender(<DealAnalysis deal={{ ...mockDeals[0], price_nis: 3000000 }} />)
  await screen.findByText('מתחת לטווח ההשוואה')
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(fetchMock.mock.calls[2]![0]).toBe('https://api.example.com/deals/row-2/analysis')
})

it.each([
  { viewKey: 'page-2' }, { viewKey: 'count-50' }, { viewKey: 'search-applied' }, { filters: { city: 'חיפה' } },
])('closes on table context changes and does not restore the old selection: %j', async (change) => {
  const view = render(<DealsTableView {...tableProps} />)
  fireEvent.click(toggle())
  await screen.findByText('מתחת לטווח ההשוואה')
  view.rerender(<DealsTableView {...tableProps} {...change} />)
  expect(screen.queryByRole('region', { name: 'פרטי העסקה' })).toBeNull()
  view.rerender(<DealsTableView {...tableProps} />)
  expect(screen.queryByRole('region', { name: 'פרטי העסקה' })).toBeNull()
})

it.each([
  [12, 'Overpriced', 'מעל לטווח ההשוואה', 'פרמיה'],
  [0, 'Fairly Priced', 'בטווח ההשוואה', 'ללא הנחה או פרמיה'],
])('shows percentage %s and empty strengths without inventing claims', async (percentage, assessment, label, description) => {
  fetchMock.mockResolvedValueOnce(ok({ ...analysis, valuation_assessment: assessment, estimated_discount_premium_pct: percentage, key_strengths: [] }))
  render(<DealAnalysis deal={mockDeals[0]} />)
  await screen.findByText(label)
  expect(screen.getByText(new RegExp(description))).toBeDefined()
  expect(screen.getByText('לא צוינו נקודות חוזקה.')).toBeDefined()
})

it.each(['page', 'count', 'filter', 'search'] as const)('closes details through the actual %s table control', async (control) => {
  vi.useFakeTimers()
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/analysis')) return ok()
    const page = Number(url.searchParams.get('page'))
    const count = Number(url.searchParams.get('count'))
    return ok({ page, count, total: 41, total_pages: Math.ceil(41 / count), rows: [mockDeals[0]] })
  })
  render(<DealsTable />)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  fireEvent.click(toggle())
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(panel()).toBeDefined()
  if (control === 'page') fireEvent.click(screen.getByRole('button', { name: 'העמוד הבא' }))
  else if (control === 'count') fireEvent.change(screen.getByRole('combobox', { name: 'עסקאות בעמוד' }), { target: { value: '50' } })
  else if (control === 'filter') fireEvent.change(screen.getByLabelText('סינון לפי עיר'), { target: { value: mockDeals[0].city } })
  else {
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'דירה' } })
    expect(panel()).toBeDefined()
  }
  await act(async () => { await vi.advanceTimersByTimeAsync(501) })
  expect(screen.queryByRole('region', { name: 'פרטי העסקה' })).toBeNull()
})
