// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { renderWithQuery as render } from '../../test/renderWithQuery'
import DealsTable from './DealsTable'
import { mockDeals } from '../data/mockDeals'

const fetchMock = vi.fn<typeof fetch>()
const names = {
  attractive: 'אטרקטיביות (מתחת למחיר ממוצע)',
  newBuild: 'בנייה חדשה (2020+)',
  full: 'החבילה המלאה (חניה + ממ"ד + מעלית)',
}
const chip = (name: string) => within(screen.getByRole('group', { name: 'סינון מהיר למשקיעים' })).getByRole('button', { name })
const params = () => new URL(String(fetchMock.mock.lastCall![0]), 'http://localhost').searchParams
beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/analysis')) return new Response(JSON.stringify({ status: 'unavailable' }))
    const page = Number(url.searchParams.get('page'))
    const count = Number(url.searchParams.get('count'))
    return new Response(JSON.stringify({ page, count, total: 41, total_pages: Math.ceil(41 / count), rows: [mockDeals[0]] }))
  })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('places three accessible chips above search and instantly applies inclusive 2020+ filtering from page 2', async () => {
  render(<DealsTable />)
  await screen.findByRole('table')
  const group = screen.getByRole('group', { name: 'סינון מהיר למשקיעים' })
  expect(within(group).getAllByRole('button')).toHaveLength(3)
  expect(group.compareDocumentPosition(screen.getByRole('searchbox')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'העמוד הבא' }))
  await screen.findByText('עמוד 2 מתוך 3 · 41 עסקאות')
  const calls = fetchMock.mock.calls.length
  chip(names.newBuild).focus()
  fireEvent.click(chip(names.newBuild))
  expect(chip(names.newBuild).getAttribute('aria-pressed')).toBe('true')
  await waitFor(() => expect(params().get('year_built_min')).toBe('2020'))
  expect(params().get('page')).toBe('1')
  expect(fetchMock).toHaveBeenCalledTimes(calls + 1)
  fireEvent.click(chip(names.newBuild))
  await waitFor(() => expect(params().has('year_built_min')).toBe(false))
  expect(chip(names.newBuild).getAttribute('aria-pressed')).toBe('false')
})

it('applies the amenity package atomically, updates existing dropdowns, and reflects a manual override', async () => {
  render(<DealsTable />)
  await screen.findByRole('table')
  fireEvent.click(chip(names.full))
  await waitFor(() => expect(params().get('has_elevator')).toBe('true'))
  expect(params().get('has_parking')).toBe('true')
  expect(params().get('has_safe_room')).toBe('true')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  for (const label of ['חניה', 'ממ״ד', 'מעלית']) expect((screen.getByLabelText(`סינון לפי ${label}`) as HTMLSelectElement).value).toBe('true')
  fireEvent.change(screen.getByLabelText('סינון לפי חניה'), { target: { value: 'false' } })
  await waitFor(() => expect(params().get('has_parking')).toBe('false'))
  expect(chip(names.full).getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(chip(names.full))
  await waitFor(() => expect(params().get('has_parking')).toBe('true'))
  fireEvent.click(chip(names.full))
  await waitFor(() => expect(params().has('has_safe_room')).toBe(false))
  expect(params().has('has_parking')).toBe(false)
  expect(params().has('has_elevator')).toBe(false)
})

it('combines chips with city, search, and price ranges, then resets everything', async () => {
  render(<DealsTable />)
  await screen.findByRole('table')
  fireEvent.change(screen.getByLabelText('סינון לפי עיר'), { target: { value: mockDeals[0].city } })
  await waitFor(() => expect(params().get('city')).toBe(mockDeals[0].city))
  fireEvent.click(screen.getByRole('button', { name: 'סינון לפי מחיר בש״ח' }))
  fireEvent.change(screen.getByLabelText('מחיר בש״ח — מקסימום'), { target: { value: '5000000' } })
  fireEvent.click(screen.getByRole('button', { name: 'החלה' }))
  await waitFor(() => expect(params().get('price_nis_max')).toBe('5000000'))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'דירה' } })
  fireEvent.click(chip(names.attractive))
  await waitFor(() => expect(params().get('below_neighborhood_average')).toBe('true'))
  expect(params().get('q')).toBe('דירה')
  fireEvent.click(chip(names.newBuild))
  fireEvent.click(chip(names.full))
  await waitFor(() => expect(params().get('has_safe_room')).toBe('true'))
  expect(params().get('city')).toBe(mockDeals[0].city)
  expect(params().get('price_nis_max')).toBe('5000000')
  expect(params().get('year_built_min')).toBe('2020')
  expect(params().get('below_neighborhood_average')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'ניקוי חיפוש ומסננים' }))
  await waitFor(() => expect([...params().keys()].sort()).toEqual(['count', 'page']))
  for (const name of Object.values(names)) expect(chip(name).getAttribute('aria-pressed')).toBe('false')
})

it('clears conflicting exact years when using the chip and lets manual year filtering replace the preset', async () => {
  render(<DealsTable />)
  await screen.findByRole('table')
  fireEvent.change(screen.getByLabelText('סינון לפי שנת בנייה'), { target: { value: '1970' } })
  await waitFor(() => expect(params().get('year_built')).toBe('1970'))
  fireEvent.click(chip(names.newBuild))
  await waitFor(() => expect(params().get('year_built_min')).toBe('2020'))
  expect(params().has('year_built')).toBe(false)
  fireEvent.change(screen.getByLabelText('סינון לפי שנת בנייה'), { target: { value: '1970' } })
  await waitFor(() => expect(params().get('year_built')).toBe('1970'))
  expect(params().has('year_built_min')).toBe(false)
  expect(chip(names.newBuild).getAttribute('aria-pressed')).toBe('false')
})

it('closes an expanded deal when applying a preset', async () => {
  render(<DealsTable />)
  await screen.findByRole('table')
  fireEvent.click(screen.getByRole('button', { name: 'פתיחת פרטי העסקה row-2' }))
  await screen.findByText('ניתוח העסקה אינו זמין כרגע.')
  fireEvent.click(chip(names.attractive))
  expect(screen.queryByRole('region', { name: 'פרטי העסקה' })).toBeNull()
  await act(async () => {})
})
