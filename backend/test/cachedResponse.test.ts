import { expect, it } from 'vitest'
import { parseCachedResponse } from '../src/cache/cachedResponse.js'
import { dealsQuerySchema, queryDeals } from '../src/deals/queryDeals.js'
import { inspectDeal } from '../src/deals/validateDeal.js'
import { validRow } from './fixtures.js'

const deal = { ...inspectDeal(validRow).deal, row_status: 'original' as const, fixed_fields: [] }
const query = dealsQuerySchema.parse({})
const response = queryDeals([deal], query)
type Response = typeof response

it('accepts a full response and pages beyond the matching results', () => {
  expect(parseCachedResponse(JSON.stringify(response), query, 1)).toEqual(response)
  const later = dealsQuerySchema.parse({ page: '2' })
  const empty = queryDeals([deal], later)
  expect(parseCachedResponse(JSON.stringify(empty), later, 1)).toEqual(empty)
})

it('accepts valid small numeric values without mistaking scientific notation for corrupt data', () => {
  const small = queryDeals([{ ...deal, price_nis: 0.00001, price_per_sqm: 0.0000001 }], query)
  expect(parseCachedResponse(JSON.stringify(small), query, 1)).toEqual(small)
})

const corruptions: Record<string, (value: Response) => unknown> = {
  'null body': () => null,
  'missing metadata': (value) => ({ ...value, rows: [inspectDeal(validRow).deal] }),
  'invalid fields': (value) => ({ ...value, rows: [{ ...deal, row_status: 'fixed', fixed_fields: ['invented'] }] }),
  'duplicate fields': (value) => ({ ...value, rows: [{ ...deal, row_status: 'fixed', fixed_fields: ['floor', 'floor'] }] }),
  'inconsistent status': (value) => ({ ...value, rows: [{ ...deal, fixed_fields: ['floor'] }] }),
  'invalid numbers': (value) => ({ ...value, rows: [{ ...deal, rooms: -1 }] }),
  'invalid date': (value) => ({ ...value, rows: [{ ...deal, deal_date: '2025-02-30' }] }),
  'invalid price': (value) => ({ ...value, rows: [{ ...deal, price_nis: 100 }] }),
  'different page': (value) => ({ ...value, page: 2 }),
  'different count': (value) => ({ ...value, count: 1 }),
  'incorrect page totals': (value) => ({ ...value, total_pages: 2 }),
  'impossible matching total': (value) => ({ ...value, total: 2 }),
  'missing rows': (value) => ({ ...value, rows: [] }),
  'extra rows': (value) => ({ ...value, rows: [deal, deal] }),
  'unknown response properties': (value) => ({ ...value, extra: true }),
}

it.each(Object.entries(corruptions))('rejects %s', (_name, corrupt) => {
  expect(parseCachedResponse(JSON.stringify(corrupt(response)), query, 1)).toBeUndefined()
})

it('rejects malformed JSON and rows that do not satisfy the requested filters', () => {
  expect(parseCachedResponse('not JSON', query, 1)).toBeUndefined()
  const filtered = dealsQuerySchema.parse({ city: 'ירושלים' })
  expect(parseCachedResponse(JSON.stringify(response), filtered, 1)).toBeUndefined()
})
