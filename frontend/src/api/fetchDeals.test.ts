import { expect, it } from 'vitest'
import { isDealsPage } from './fetchDeals'
import { mockDeals } from '../data/mockDeals'

const page = (row: unknown) => ({ page: 1, count: 20, total: 1, total_pages: 1, rows: [row] })

it('accepts original and repaired rows with typed field metadata', () => {
  expect(isDealsPage(page(mockDeals[0]))).toBe(true)
  expect(isDealsPage(page(mockDeals[2]))).toBe(true)
  expect(isDealsPage(page({ ...mockDeals[2], floor: 'unknown', fixed_fields: ['floor', 'deal_id'] }))).toBe(true)
})

it.each([
  undefined, null, 'street', ['invented_field'], ['row_status'], ['fixed_fields'], [1],
  ['street', 'street'], [],
])('rejects malformed or inconsistent repaired-field metadata: %j', (fixed_fields) => {
  expect(isDealsPage(page({ ...mockDeals[2], fixed_fields }))).toBe(false)
})

it('rejects a row claiming to be original with repaired fields', () => {
  expect(isDealsPage(page({ ...mockDeals[0], fixed_fields: ['street'] }))).toBe(false)
})

it.each([undefined, null, 2, '', 'D1', 'row-1', 'row-02', 'row-2.5', 'row-9007199254740992'])('rejects an invalid or missing row_id: %j', (row_id) => {
  expect(isDealsPage(page({ ...mockDeals[0], row_id }))).toBe(false)
})

it('keeps row_id separate from repaired column names', () => {
  expect(isDealsPage(page({ ...mockDeals[2], fixed_fields: ['row_id'] }))).toBe(false)
})
