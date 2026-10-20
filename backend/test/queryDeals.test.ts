import { rm } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { csv, fixture } from './fixtures.js'

let directory: string
let server: ReturnType<typeof buildApp>

beforeAll(async () => {
  const input = await fixture(csv([
    {},
    { deal_id: 'D2', city: 'תל אביב', rooms: '3.5', floor: '1', has_parking: 'true' },
    { deal_id: 'D3', rooms: '4', year_built: 'unknown', price_per_sqm: '' },
    { deal_id: 'D4', rooms: '4' },
    { deal_id: 'D5', city: 'תל אביב', has_parking: 'true' },
  ]))
  directory = input.directory
  // Use the same startup import as production, without network/model calls.
  server = buildApp({}, { csvPath: input.path })
  await server.waitForDeals()
})

afterAll(async () => {
  await server.close()
  await rm(directory, { recursive: true })
})

async function get(query: Record<string, string> = {}) {
  return server.inject(`/deals?${new URLSearchParams(query)}`)
}

describe('GET /deals', () => {
  it.each([
    ['size_sqm', 100], ['price_nis', 2000000], ['price_per_sqm', 20000],
  ] as const)('applies inclusive, open-ended, empty, and combined %s ranges before pagination', async (field, value) => {
    expect((await get({ [`${field}_min`]: String(value), [`${field}_max`]: String(value), count: '2', page: '2' })).json())
      .toMatchObject({ total: 5, total_pages: 3, rows: [server.deals[2], server.deals[3]] })
    expect((await get({ [`${field}_min`]: '0' })).json().total).toBe(5)
    expect((await get({ [`${field}_max`]: String(value) })).json().total).toBe(5)
    expect((await get({ [`${field}_min`]: String(value + 0.5) })).json().total).toBe(0)
    expect((await get({ [`${field}_max`]: String(value - 0.5) })).json().total).toBe(0)
    expect((await get({ [`${field}_min`]: String(value + 1), [`${field}_max`]: String(value) })).json().total).toBe(0)
    expect((await get({ [`${field}_min`]: String(value), city: 'תל אביב', deal_date: '2024-02-29', q: 'הרצל' })).json())
      .toMatchObject({ total: 2, rows: [server.deals[1], server.deals[4]] })
  })

  it.each(['size_sqm_min', 'size_sqm_max', 'price_nis_min', 'price_nis_max', 'price_per_sqm_min', 'price_per_sqm_max'])(
    'rejects invalid %s range bounds', async (field) => {
      for (const value of ['abc', '-1', 'Infinity', '']) {
        expect((await get({ [field]: value })).statusCode).toBe(400)
      }
    },
  )

  it('calculates totals and pages after combining free-text search and column filters', async () => {
    const first = (await get({ q: 'חיפה', rooms: '4', count: '1' })).json()
    expect(first).toMatchObject({ page: 1, total: 2, total_pages: 2, rows: [{ deal_id: 'D3' }] })
    expect((await get({ q: 'חיפה', rooms: '4', count: '1', page: '2' })).json()).toMatchObject({ page: 2, total: 2, total_pages: 2, rows: [{ deal_id: 'D4' }] })
    expect((await get({ q: 'לא ידוע' })).json()).toMatchObject({ total: 1, total_pages: 1, rows: [{ deal_id: 'D3' }] })
    expect((await get({ q: 'הושלמו על ידי המערכת' })).json().total).toBe(1)
    expect((await get({ q: 'מקורית' })).json().total).toBe(4)
    expect((await get({ q: '2,000,000' })).json().total).toBe(5)
    expect((await get({ q: 'כן' })).json().total).toBe(5)
    expect((await get({ q: 'לא' })).json().total).toBe(5)
    expect((await get({ q: 'לא קיים' })).json()).toMatchObject({ total: 0, total_pages: 0, rows: [] })
    expect((await get({ q: '   ' })).json().total).toBe(5)
  })

  it('paginates fixed rows and filters unknown floors before calculating totals', async () => {
    const input = await fixture(csv([
      {},
      { deal_id: 'D2', floor: '' },
      { deal_id: 'D3', floor: '', price_per_sqm: '' },
      { deal_id: 'D4', price_per_sqm: '' },
    ]))
    const filteredApp = buildApp({}, { csvPath: input.path })
    try {
      await filteredApp.waitForDeals()
      const response = await filteredApp.inject('/deals?row_status=fixed&floor=unknown&count=1&page=2')
      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ page: 2, count: 1, total: 2, total_pages: 2, rows: [{ deal_id: 'D3', floor: 'unknown', row_status: 'fixed' }] })
      expect((await filteredApp.inject('/deals?row_status=original')).json().rows.map((row: { deal_id: string }) => row.deal_id)).toEqual(['D1'])
    } finally {
      await filteredApp.close()
      await rm(input.directory, { recursive: true })
    }
  })

  it('returns default pagination and full saved rows, including their status', async () => {
    const response = await get()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ page: 1, count: 20, total: 5, total_pages: 1, rows: server.deals,
      filtered_summary: { average_price_per_sqm: 20000, city_comparison: null },
      filter_options: { property_type: ['דירה'], condition: ['שמור'], source: ['רשות המסים'] },
      location_options: { scope: { city: null, neighborhood: null }, selected_city: null, cities: ['חיפה', 'תל אביב-יפו'], neighborhoods: ['הדר'], streets: ['הרצל'] } })
    expect(response.json().rows[2].row_status).toBe('fixed')
    expect(response.json().rows[0].fixed_fields).toEqual([])
    expect(response.json().rows[2].fixed_fields).toEqual(['price_per_sqm'])
  })

  it('uses stable import order for nonoverlapping pages and the partial final page', async () => {
    for (const [page, ids] of [['1', ['D1', 'D2']], ['2', ['D3', 'D4']], ['3', ['D5']]] as const) {
      const response = await get({ page, count: '2' })
      expect(response.json()).toMatchObject({ page: Number(page), count: 2, total: 5, total_pages: 3 })
      expect(response.json().rows.map((row: { deal_id: string }) => row.deal_id)).toEqual(ids)
    }
    expect((await get({ page: '4', count: '2' })).json()).toMatchObject({ page: 4, total: 5, total_pages: 3, rows: [] })
  })

  it('applies combined filters before pagination and counts only matching rows', async () => {
    expect((await get({ city: ' חיפה ', rooms: '4', count: '1', page: '2' })).json()).toEqual({
      page: 2, count: 1, total: 2, total_pages: 2, rows: [server.deals[3]],
      filtered_summary: { average_price_per_sqm: 20000, city_comparison: { city: 'חיפה', average_price_per_sqm: 20000, difference_pct: 0 } },
      filter_options: { property_type: ['דירה'], condition: ['שמור'], source: ['רשות המסים'] },
      location_options: { scope: { city: 'חיפה', neighborhood: null }, selected_city: 'חיפה', cities: ['חיפה', 'תל אביב-יפו'], neighborhoods: ['הדר'], streets: ['הרצל'] },
    })
    expect((await get({ city: 'חיפה', has_parking: 'true' })).json()).toMatchObject({ total: 0, total_pages: 0, rows: [] })
  })

  it('accepts every specified filter together with typed exact matching', async () => {
    const { deal_id: _id, row_id: _rowId, row_status: _status, fixed_fields: _fixedFields, ...filters } = server.deals[0]!
    const query = Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, String(value)]))
    expect((await get(query)).json().rows).toEqual([server.deals[0]])
    // Independently exercise each filter rather than letting another field mask it.
    for (const [key, value] of Object.entries(query)) {
      const rows = (await get({ [key]: value })).json().rows
      expect(rows).toEqual(server.deals.filter((deal) => String(deal[key as keyof typeof deal]) === value))
    }
  })

  it('handles fractional rooms, zero floors, false booleans, and unknown years', async () => {
    expect((await get({ rooms: '3.5' })).json().rows).toEqual([server.deals[1]])
    expect((await get({ floor: '0', has_parking: 'false' })).json().rows).toEqual([server.deals[0], server.deals[2], server.deals[3]])
    expect((await get({ year_built: 'unknown' })).json().rows).toEqual([server.deals[2]])
    expect((await get({ city: 'תל' })).json().rows).toEqual([])
    expect((await get({ count: '100', page: String(Number.MAX_SAFE_INTEGER) })).json().rows).toEqual([])
  })

  it.each([
    { page: '0' }, { page: '-1' }, { page: '1.5' }, { page: '1e2' }, { page: '9007199254740992' },
    { count: '0' }, { count: '101' }, { count: '' }, { count: 'NaN' },
    { city: '  ' }, { rooms: 'no' }, { rooms: '0' }, { size_sqm: '-2' },
    { floor: '1.5' }, { floor: 'invalid' }, { total_floors: '-1' },
    { year_built: '0' }, { year_built: '1990.5' }, { year_built: 'Unknown' },
    { has_elevator: 'yes' }, { has_parking: '0' }, { has_balcony: '' }, { has_safe_room: 'FALSE' },
    { deal_date: '2025-02-29' }, { deal_date: '01/01/2025' },
    { price_nis: 'Infinity' }, { price_per_sqm: '0' }, { row_status: 'invalid' }, { unsupported: 'value' },
  ])('rejects invalid query parameters: %j', async (query) => {
    const response = await get(query)
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'פרמטרי החיפוש אינם תקינים', fields: expect.any(Array) })
  })

  it('rejects repeated parameters instead of silently choosing a value', async () => {
    expect((await server.inject('/deals?city=חיפה&city=ירושלים')).statusCode).toBe(400)
    expect((await server.inject('/deals?page=1&page=2')).statusCode).toBe(400)
  })
})
