// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderWithQuery as render } from '../../test/renderWithQuery'
import FilteredResultsSummary from './FilteredResultsSummary'
import DealsTable from './DealsTable'
import { mockDeals } from '../data/mockDeals'
import { isDealsPage } from '../api/fetchDeals'
import { isFilteredSummary } from '../api/isFilteredSummary'

const summary = { average_price_per_sqm: 41200, city_comparison: {
  city: 'חיפה', average_price_per_sqm: 43829.78723404255, difference_pct: -6,
} }
const badge = () => screen.getByRole('status', { name: 'סיכום תוצאות מסוננות' })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('shows count, average, city, and discount for all matching rows', () => {
  render(<FilteredResultsSummary total={45} summary={summary} loading={false} />)
  expect(badge().textContent).toContain('מוצגות 45 עסקאות')
  expect(badge().textContent).toContain('41,200 ₪')
  expect(badge().textContent).toContain('נמוך ב־6% מהממוצע העירוני בחיפה')
})

it.each([0, 6])('shows equal or above city average at %s percent', (difference) => {
  const value = { average_price_per_sqm: 10000 * (1 + difference / 100),
    city_comparison: { city: 'חיפה', average_price_per_sqm: 10000, difference_pct: difference } }
  render(<FilteredResultsSummary total={45} summary={value} loading={false} />)
  expect(badge().textContent).toContain(difference === 0 ? 'כממוצע העירוני' : 'גבוה ב־6%')
})

it('handles multiple cities, empty matches, and older servers without fabricating averages', () => {
  const view = render(<FilteredResultsSummary total={45} summary={{ average_price_per_sqm: 41200, city_comparison: null }} loading={false} />)
  expect(badge().textContent).toContain('כמה ערים')
  view.rerender(<FilteredResultsSummary total={0} summary={{ average_price_per_sqm: null, city_comparison: null }} loading={false} />)
  expect(badge().textContent).toContain('מוצגות 0 עסקאות')
  expect(badge().textContent).toContain('אין נתונים לחישוב ממוצע')
  view.rerender(<FilteredResultsSummary total={45} loading={false} />)
  expect(badge().textContent).toContain('לא זמין')
  expect(badge().textContent).not.toContain('₪')
})

it('replaces stale counts and prices with a loading state during updates', () => {
  render(<FilteredResultsSummary total={45} summary={summary} loading />)
  expect(badge().textContent).toBe('מעדכן סיכום תוצאות…')
  expect(badge().textContent).not.toContain('41,200')
})

it.each([
  undefined, null, [], {}, { ...summary, average_price_per_sqm: 0 },
  { ...summary, average_price_per_sqm: NaN }, { ...summary, average_price_per_sqm: Infinity },
  { ...summary, city_comparison: undefined }, { ...summary, city_comparison: 'חיפה' },
  { ...summary, city_comparison: { ...summary.city_comparison, city: '' } },
  { ...summary, city_comparison: { ...summary.city_comparison, average_price_per_sqm: 0 } },
  { ...summary, city_comparison: { ...summary.city_comparison, difference_pct: 50 } },
])('rejects invalid summary metadata: %j', (value) => {
  expect(isFilteredSummary(value, 45)).toBe(false)
})

it('validates summaries against result counts while retaining compatibility with older API responses', () => {
  expect(isFilteredSummary(summary, 45)).toBe(true)
  expect(isFilteredSummary({ average_price_per_sqm: 41200, city_comparison: null }, 45)).toBe(true)
  expect(isFilteredSummary({ average_price_per_sqm: null, city_comparison: null }, 0)).toBe(true)
  expect(isFilteredSummary(summary, 0)).toBe(false)
  const page = { page: 1, count: 20, total: 1, total_pages: 1, rows: [mockDeals[0]] }
  expect(isDealsPage(page)).toBe(true)
  expect(isDealsPage({ ...page, filtered_summary: summary })).toBe(true)
  expect(isDealsPage({ ...page, filtered_summary: {} })).toBe(false)
})

it('updates with actual filters, keeps summaries stable across pages, and hides stale insights while loading', async () => {
  vi.stubEnv('VITE_API_BASE_URL', '')
  let resolve!: (value: Response) => void
  let delayed = false
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const params = new URL(String(input), 'http://localhost').searchParams
    const filtered = params.get('rooms') === '3'
    const page = Number(params.get('page'))
    const count = Number(params.get('count'))
    const total = filtered ? 45 : 510
    const response = new Response(JSON.stringify({ page, count, total, total_pages: Math.ceil(total / count), rows: [mockDeals[0]],
      filtered_summary: filtered ? summary : { average_price_per_sqm: 50000, city_comparison: null } }))
    if (filtered && !delayed) { delayed = true; return new Promise<Response>((done) => { resolve = done }) }
    return response
  }))
  render(<DealsTable />)
  await waitFor(() => expect(badge().textContent).toContain('מוצגות 510 עסקאות'))
  fireEvent.change(screen.getByLabelText('סינון לפי חדרים'), { target: { value: '3' } })
  await waitFor(() => expect(badge().textContent).toBe('מעדכן סיכום תוצאות…'))
  await act(async () => { resolve(new Response(JSON.stringify({ page: 1, count: 20, total: 45, total_pages: 3,
    rows: [mockDeals[0]], filtered_summary: summary }))) })
  await waitFor(() => expect(badge().textContent).toContain('41,200 ₪'))
  fireEvent.click(screen.getByRole('button', { name: 'העמוד הבא' }))
  await screen.findByText('עמוד 2 מתוך 3 · 45 עסקאות')
  expect(badge().textContent).toContain('מוצגות 45 עסקאות')
  expect(badge().textContent).toContain('נמוך ב־6%')
  fireEvent.click(screen.getByRole('button', { name: 'ניקוי חיפוש ומסננים' }))
  await waitFor(() => expect(badge().textContent).toContain('מוצגות 510 עסקאות'))
})
