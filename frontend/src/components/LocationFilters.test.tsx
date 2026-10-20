// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { renderWithQuery as render } from '../../test/renderWithQuery'
import DealsTable from './DealsTable'
import { mockDeals } from '../data/mockDeals'
import { isDealsPage, fetchDeals } from '../api/fetchDeals'

const locations = [
  { city: 'חיפה', neighborhood: 'הדר', street: 'הרצל' },
  { city: 'חיפה', neighborhood: 'הדר', street: 'בלפור' },
  { city: 'חיפה', neighborhood: 'כרמל', street: 'חורב' },
  { city: 'תל אביב', neighborhood: 'מרכז', street: 'דיזנגוף' },
  { city: 'תל אביב', neighborhood: 'צפון', street: 'נורדאו' },
]
const rows = locations.map((location, index) => ({ ...mockDeals[0], ...location, row_id: `row-${index + 2}` }))
const fetchMock = vi.fn<typeof fetch>()
function response(params = new URLSearchParams()) {
  const city = params.get('city')
  const neighborhood = params.get('neighborhood')
  const cityRows = rows.filter((row) => !city || row.city === city)
  const neighborhoodRows = cityRows.filter((row) => !neighborhood || row.neighborhood === neighborhood)
  const matches = neighborhoodRows.filter((row) => (!params.get('street') || row.street === params.get('street')) &&
    (!params.get('rooms') || String(row.rooms) === params.get('rooms')))
  const unique = (values: string[]) => [...new Set(values)]
  const count = Number(params.get('count') || 20)
  const page = Number(params.get('page') || 1)
  return { page, count, total: matches.length, total_pages: Math.ceil(matches.length / count), rows: matches.slice(0, 1),
    location_options: { scope: { city, neighborhood }, cities: unique(rows.map((row) => row.city)),
      neighborhoods: unique(cityRows.map((row) => row.neighborhood)), streets: unique(neighborhoodRows.map((row) => row.street)) } }
}
const ok = (params: URLSearchParams) => new Response(JSON.stringify(response(params)))
const select = (label: string) => screen.getByLabelText(`סינון לפי ${label}`) as HTMLSelectElement
const values = (label: string) => [...select(label).options].map((option) => option.value)
const choose = (label: string, value: string) => fireEvent.change(select(label), { target: { value } })
const lastParams = () => new URL(String(fetchMock.mock.lastCall![0]), 'http://localhost').searchParams
beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(async (input) => ok(new URL(String(input), 'http://localhost').searchParams))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('retains all sibling choices after selecting a city, neighborhood, and street, including locations outside the page', async () => {
  render(<DealsTable />)
  await screen.findByRole('table')
  expect(values('עיר')).toEqual(['', 'חיפה', 'תל אביב'])
  choose('עיר', 'חיפה')
  await waitFor(() => expect(values('שכונה')).toEqual(['', 'הדר', 'כרמל']))
  choose('שכונה', 'הדר')
  await waitFor(() => expect(values('רחוב')).toEqual(['', 'הרצל', 'בלפור']))
  choose('רחוב', 'הרצל')
  await waitFor(() => expect(lastParams().get('street')).toBe('הרצל'))
  expect(values('עיר')).toEqual(['', 'חיפה', 'תל אביב'])
  expect(values('שכונה')).toEqual(['', 'הדר', 'כרמל'])
  expect(values('רחוב')).toEqual(['', 'הרצל', 'בלפור'])
  choose('רחוב', 'בלפור')
  await waitFor(() => expect(lastParams().get('street')).toBe('בלפור'))
  choose('שכונה', 'כרמל')
  await waitFor(() => expect(values('רחוב')).toEqual(['', 'חורב']))
  expect(lastParams().has('street')).toBe(false)
  expect(select('רחוב').value).toBe('')
  choose('רחוב', 'חורב')
  await waitFor(() => expect(lastParams().get('street')).toBe('חורב'))
  choose('עיר', 'תל אביב')
  await waitFor(() => expect(values('שכונה')).toEqual(['', 'מרכז', 'צפון']))
  expect(values('רחוב')).toEqual(['', 'דיזנגוף', 'נורדאו'])
  expect(lastParams().has('neighborhood')).toBe(false)
  expect(lastParams().has('street')).toBe(false)
  expect(select('שכונה').value).toBe('')
  expect(values('עיר')).toEqual(['', 'חיפה', 'תל אביב'])
})

it('keeps the catalog when other filters produce zero matches and broadens descendants when parents are cleared', async () => {
  render(<DealsTable />)
  await screen.findByRole('table')
  choose('עיר', 'חיפה')
  await waitFor(() => expect(values('שכונה')).toEqual(['', 'הדר', 'כרמל']))
  choose('שכונה', 'הדר')
  await waitFor(() => expect(values('רחוב')).toEqual(['', 'הרצל', 'בלפור']))
  fireEvent.change(screen.getByLabelText('סינון לפי חדרים'), { target: { value: '99' } })
  await screen.findByText('לא נמצאו עסקאות התואמות לחיפוש ולמסננים.')
  expect(values('עיר')).toEqual(['', 'חיפה', 'תל אביב'])
  expect(values('שכונה')).toEqual(['', 'הדר', 'כרמל'])
  expect(values('רחוב')).toEqual(['', 'הרצל', 'בלפור'])
  choose('שכונה', '')
  await waitFor(() => expect(values('רחוב')).toEqual(['', 'הרצל', 'בלפור', 'חורב']))
  choose('עיר', '')
  await waitFor(() => expect(select('שכונה').disabled).toBe(true))
  expect(values('שכונה')).toEqual([''])
  expect(lastParams().get('rooms')).toBe('99')
})

it('requires a city before enabling neighborhoods and disables them again after clearing it', async () => {
  render(<DealsTable />)
  await screen.findByRole('table')
  expect(select('שכונה').disabled).toBe(true)
  expect(values('שכונה')).toEqual([''])
  expect(select('שכונה').selectedOptions[0].textContent).toBe('יש לבחור עיר תחילה')
  choose('עיר', 'חיפה')
  await waitFor(() => expect(select('שכונה').disabled).toBe(false))
  expect(values('שכונה')).toEqual(['', 'הדר', 'כרמל'])
  choose('שכונה', 'הדר')
  await waitFor(() => expect(lastParams().get('neighborhood')).toBe('הדר'))
  choose('עיר', '')
  expect(select('שכונה').disabled).toBe(true)
  await waitFor(() => expect(lastParams().has('neighborhood')).toBe(false))
})

it('disables stale descendants, allows rapid city switching, and ignores a late parent response', async () => {
  let finish!: (value: Response) => void
  let citySignal: AbortSignal | undefined
  fetchMock.mockImplementation(async (input, init) => {
    const params = new URL(String(input), 'http://localhost').searchParams
    if (params.get('city') === 'חיפה') {
      citySignal = init?.signal as AbortSignal
      return new Promise<Response>((resolve) => { finish = resolve })
    }
    return ok(params)
  })
  render(<DealsTable />)
  await screen.findByRole('table')
  choose('עיר', 'חיפה')
  await waitFor(() => expect(select('שכונה').disabled).toBe(true))
  expect(select('רחוב').disabled).toBe(true)
  expect(values('שכונה')).toEqual([''])
  expect(select('עיר').disabled).toBe(false)
  choose('עיר', 'תל אביב')
  await waitFor(() => expect(values('שכונה')).toEqual(['', 'מרכז', 'צפון']))
  expect(citySignal!.aborted).toBe(true)
  await act(async () => { finish(ok(new URLSearchParams({ city: 'חיפה' }))) })
  expect(values('שכונה')).toEqual(['', 'מרכז', 'צפון'])
  expect(select('עיר').value).toBe('תל אביב')
})

it('validates optional metadata and rejects location scopes inconsistent with the request', async () => {
  expect(isDealsPage(response())).toBe(true)
  expect(isDealsPage({ ...response(), location_options: {} })).toBe(false)
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(response())))
  await expect(fetchDeals(1, 20, new AbortController().signal, 'city=חיפה', vi.fn())).rejects.toThrow('אפשרויות מיקום')
  fetchMock.mockResolvedValueOnce(ok(new URLSearchParams({ city: 'חיפה', neighborhood: 'הדר' })))
  await expect(fetchDeals(1, 20, new AbortController().signal, 'city=חיפה', vi.fn())).rejects.toThrow('אפשרויות מיקום')
})
