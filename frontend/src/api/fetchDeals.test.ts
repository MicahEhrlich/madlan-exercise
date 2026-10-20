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
