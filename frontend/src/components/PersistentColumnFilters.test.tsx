// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { renderWithQuery as render } from '../../test/renderWithQuery'
import DealsTable from './DealsTable'
import { mockDeals } from '../data/mockDeals'
import { isDealsPage } from '../api/fetchDeals'
import { isFilterOptions } from '../api/isFilterOptions'
import { columnFilterOptions, formatColumnFilterOption } from '../utils/columnFilterOptions'

const rows = [
  { ...mockDeals[0], property_type: 'דירה', condition: 'חדש', source: 'רשות המסים' },
  { ...mockDeals[1], property_type: 'בית', condition: 'לשיפוץ', source: 'מדלן' },
]
const catalog = { property_type: ['דירה', 'בית'], condition: ['חדש', 'לשיפוץ', 'unknown'], source: ['רשות המסים', 'מדלן'] }
const fetchMock = vi.fn<typeof fetch>()
const select = (label: string) => screen.getByLabelText(`סינון לפי ${label}`) as HTMLSelectElement
const labels = (label: string) => [...select(label).options].map((option) => option.textContent)
const lastParams = () => new URL(String(fetchMock.mock.lastCall![0]), 'http://localhost').searchParams
beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(async (input) => {
    const params = new URL(String(input), 'http://localhost').searchParams
    const matches = rows.filter((row) => ['property_type', 'condition', 'source', 'has_elevator', 'has_parking', 'has_balcony', 'has_safe_room', 'rooms'].every((field) =>
      !params.has(field) || String(row[field as keyof typeof row]) === params.get(field)))
    const page = Number(params.get('page'))
    const count = Number(params.get('count'))
    return new Response(JSON.stringify({ page, count, total: matches.length, total_pages: Math.ceil(matches.length / count),
      rows: matches.slice(0, 1), filter_options: catalog }))
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each([
  ['מעלית', 'has_elevator'], ['חניה', 'has_parking'], ['מרפסת', 'has_balcony'], ['ממ״ד', 'has_safe_room'],
])('always offers הכול/כן/לא for %s before and after either selection', async (label, field) => {
  render(<DealsTable />)
  await screen.findByRole('table')
  expect(labels(label)).toEqual(['הכול', 'כן', 'לא'])
  for (const value of ['true', 'false', '']) {
    fireEvent.change(select(label), { target: { value } })
    await waitFor(() => expect(lastParams().get(field) ?? '').toBe(value))
    await waitFor(() => expect(screen.queryByText('טוען עסקאות…')).toBeNull())
    expect(labels(label)).toEqual(['הכול', 'כן', 'לא'])
    expect(select(label).value).toBe(value)
  }
})

it.each([
  ['סוג נכס', 'property_type', 'דירה', 'בית', ['הכול', 'דירה', 'בית']],
  ['מצב הנכס', 'condition', 'חדש', 'לשיפוץ', ['הכול', 'חדש', 'לשיפוץ', 'לא ידוע']],
  ['מקור', 'source', 'רשות המסים', 'מדלן', ['הכול', 'רשות המסים', 'מדלן']],
])('keeps every %s choice, including values outside the current page, and switches without clearing', async (label, field, first, second, options) => {
  render(<DealsTable />)
  await screen.findByRole('table')
  expect(labels(label)).toEqual(options)
  fireEvent.change(select(label), { target: { value: first } })
  await waitFor(() => expect(lastParams().get(field)).toBe(first))
  await waitFor(() => expect(screen.queryByText('טוען עסקאות…')).toBeNull())
  expect(labels(label)).toEqual(options)
  fireEvent.change(select(label), { target: { value: second } })
  await waitFor(() => expect(lastParams().get(field)).toBe(second))
  expect(labels(label)).toEqual(options)
})

it('retains all requested choices when other filters leave no results', async () => {
  render(<DealsTable />)
  await screen.findByRole('table')
  fireEvent.change(screen.getByLabelText('סינון לפי חדרים'), { target: { value: '99' } })
  await screen.findByText('לא נמצאו עסקאות התואמות לחיפוש ולמסננים.')
  for (const label of ['מעלית', 'חניה', 'מרפסת', 'ממ״ד']) expect(labels(label)).toEqual(['הכול', 'כן', 'לא'])
  expect(labels('סוג נכס')).toEqual(['הכול', 'דירה', 'בית'])
  expect(labels('מצב הנכס')).toEqual(['הכול', 'חדש', 'לשיפוץ', 'לא ידוע'])
  expect(labels('מקור')).toEqual(['הכול', 'רשות המסים', 'מדלן'])
})

it('validates catalog metadata and preserves legacy options and current selections', () => {
  expect(isFilterOptions(catalog)).toBe(true)
  expect(isFilterOptions({ property_type: [], condition: [], source: [] })).toBe(true)
  expect(isFilterOptions({ property_type: [], condition: [] })).toBe(true)
  expect(columnFilterOptions('source', rows, {}, { property_type: [], condition: [] })).toEqual(['רשות המסים', 'מדלן'])
  for (const data of [null, [], {}, { ...catalog, condition: 'חדש' }, { ...catalog, property_type: ['דירה', 'דירה'] },
    { ...catalog, condition: [null] }, { ...catalog, condition: [' '] }, { ...catalog, source: null },
    { ...catalog, source: ['מדלן', 'מדלן'] }]) expect(isFilterOptions(data)).toBe(false)
  const page = { page: 1, count: 20, total: 1, total_pages: 1, rows: [mockDeals[0]] }
  expect(isDealsPage({ ...page, filter_options: catalog })).toBe(true)
  expect(isDealsPage({ ...page, filter_options: {} })).toBe(false)
  expect(columnFilterOptions('property_type', rows, { property_type: 'דירת גן' }, catalog)).toEqual(['דירה', 'בית', 'דירת גן'])
  expect(columnFilterOptions('condition', rows, {})).toEqual(['חדש', 'לשיפוץ'])
  expect(columnFilterOptions('has_elevator', [], {})).toEqual(['true', 'false'])
  expect(formatColumnFilterOption('has_elevator', 'true', [])).toBe('כן')
  expect(formatColumnFilterOption('has_elevator', 'false', [])).toBe('לא')
})
