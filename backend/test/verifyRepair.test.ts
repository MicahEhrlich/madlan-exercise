import { expect, it } from 'vitest'
import { isVerifiedRepair, verifyRepairReport } from '../src/repairs/verifyRepair.js'
import { candidate, proposed, report } from './repairFixtures.js'

it('accepts row-evidenced amenity representations and recomputes verified counts', () => {
  const row = candidate()
  expect(verifyRepairReport(JSON.stringify(report([proposed(row)])), [row])).toEqual(report([proposed(row)]))
})

it.each([
  { city: 'invented' }, { rooms: 9 }, { year_built: 2020 }, { deal_date: '2025-01-01' },
  { price_nis: 3000000 }, { has_elevator: false },
])('rejects changed valid fields: %j', (change) => {
  const row = candidate()
  expect(verifyRepairReport(JSON.stringify(report([proposed(row, change)])), [row])).toEqual(report([], [row.original]))
})

it.each([{ year_built: '' }, { neighborhood: '' }, { deal_date: 'Aug 2025' }, { has_parking: 'unknown' }])('rejects unsupported guesses: %j', (change) => {
  const row = candidate(change)
  const proposal = proposed(row, { year_built: 1990, neighborhood: 'הדר', deal_date: '2024-02-29' })
  expect(isVerifiedRepair(row, proposal)).toBe(false)
})

it.each([
  [{ rooms: '3 rooms' }, { rooms: 3 }],
  [{ rooms: '3 חדר' }, { rooms: 3 }],
  [{ size_sqm: '100 sqm', price_per_sqm: '' }, { size_sqm: 100, price_per_sqm: 20000 }],
  [{ price_nis: '2000000 NIS', price_per_sqm: '' }, { price_nis: 2000000, price_per_sqm: 20000 }],
  [{ has_parking: 'אין' }, { has_parking: false }],
] as const)('accepts explicit, independently verified field formats: %j', (raw, values) => {
  const row = candidate(raw)
  expect(isVerifiedRepair(row, proposed(row, values))).toBe(true)
})

it('rejects wrong field evidence, arithmetic, or values still failing validation', () => {
  const row = candidate({ size_sqm: '100 sqm', price_per_sqm: '' })
  expect(isVerifiedRepair(row, proposed(row, { size_sqm: 120, price_per_sqm: 20000 }))).toBe(false)
  expect(isVerifiedRepair(row, proposed(row, { size_sqm: 100, price_per_sqm: 20001 }))).toBe(false)
  const zero = candidate({ rooms: '0 rooms' })
  expect(isVerifiedRepair(zero, proposed(zero, { rooms: 0 }))).toBe(false)
  const floor = candidate({ floor: '9' })
  expect(isVerifiedRepair(floor, proposed(floor))).toBe(false)
})

it('keeps failed raw rows unchanged, including their formatting', () => {
  const row = candidate({ deal_id: ' D1 ' })
  expect(verifyRepairReport(JSON.stringify(report([], [row.original])), [row])).toEqual(report([], [row.original]))
})

it.each([
  '{',
  JSON.stringify({ ...report(), auto_corrected: 1 }),
  JSON.stringify({ ...report(), rows_failed_to_correct: 1 }),
  JSON.stringify(report()),
])('rejects malformed schemas or accounting: %s', (text) => {
  expect(() => verifyRepairReport(text, [candidate()])).toThrow()
})

it('rejects unknown IDs, duplicate results, ambiguous submissions, and altered failed rows', () => {
  const row = candidate()
  const other = candidate({ deal_id: 'D2' })
  expect(() => verifyRepairReport(JSON.stringify(report([proposed(row, { deal_id: 'unknown' })])), [row])).toThrow()
  expect(() => verifyRepairReport(JSON.stringify(report([proposed(row), proposed(row)])), [row, other])).toThrow()
  expect(() => verifyRepairReport(JSON.stringify(report([], [row.original, row.original])), [row, other])).toThrow()
  expect(() => verifyRepairReport(JSON.stringify(report([], [{ ...row.original, city: 'altered' }])), [row])).toThrow()
  expect(() => verifyRepairReport(JSON.stringify(report([proposed(row), proposed(row)])), [row, row])).toThrow()
})

it('matches corrected and failed rows with a shared ID using their city and street', () => {
  const first = candidate()
  const second = candidate({ street: 'הנביאים' })
  const results = report([proposed(second)], [first.original])
  expect(verifyRepairReport(JSON.stringify(results), [first, second])).toEqual(results)
  expect(verifyRepairReport(JSON.stringify(report([proposed(second), proposed(first)])), [first, second])).toEqual(report([proposed(second), proposed(first)]))
})

it('rejects duplicate or ambiguous returned addresses even when the ID is reused', () => {
  const first = candidate()
  const second = candidate({ city: 'ירושלים' })
  expect(() => verifyRepairReport(JSON.stringify(report([proposed(first), proposed(first)])), [first, second])).toThrow('Duplicate repair result')
  expect(() => verifyRepairReport(JSON.stringify(report([proposed(first, { city: 'unknown' }), proposed(second)])), [first, second])).toThrow('ambiguous')
})

it('preserves defaults in model output and rejects invented replacements', () => {
  const row = candidate({ floor: '', condition: '', has_parking: '', rooms: '3 rooms' })
  const correct = proposed(row, { rooms: 3, has_parking: false })
  expect(isVerifiedRepair(row, correct)).toBe(true)
  expect(isVerifiedRepair(row, { ...correct, floor: 2 })).toBe(false)
  expect(isVerifiedRepair(row, { ...correct, condition: 'חדש' })).toBe(false)
  expect(isVerifiedRepair(row, { ...correct, has_parking: true })).toBe(false)
})

it('verifies reciprocal arithmetic after an independently evidenced numeric format repair', () => {
  const size = candidate({ size_sqm: '', price_nis: '2000000 NIS' })
  expect(isVerifiedRepair(size, proposed(size, { size_sqm: 100, price_nis: 2000000 }))).toBe(true)
  const price = candidate({ price_nis: '', size_sqm: '100 sqm' })
  expect(isVerifiedRepair(price, proposed(price, { size_sqm: 100, price_nis: 2000000 }))).toBe(true)
  expect(isVerifiedRepair(price, proposed(price, { size_sqm: 100, price_nis: 3000000 }))).toBe(false)
  const ambiguous = candidate({ price_nis: '', size_sqm: '' })
  expect(isVerifiedRepair(ambiguous, proposed(ambiguous, { size_sqm: 100, price_nis: 2000000 }))).toBe(false)
})

it('accepts full ISO dates from date-format repair and defaults only the missing day', () => {
  const row = candidate({ deal_date: 'Aug 2025' })
  const correct = proposed(row, { deal_date: '2025-08-01' })
  expect(verifyRepairReport(JSON.stringify(report([correct])), [row])).toEqual(report([correct]))
  expect(isVerifiedRepair(row, { ...correct, deal_date: '2025-08-15' })).toBe(false)
  expect(isVerifiedRepair(row, { ...correct, deal_date: '2026-08-01' })).toBe(false)
  const full = candidate({ deal_date: 'August 15, 2025' })
  expect(isVerifiedRepair(full, proposed(full, { deal_date: '2025-08-15' }))).toBe(true)
  const impossible = candidate({ deal_date: '31/04/2025' })
  expect(isVerifiedRepair(impossible, proposed(impossible, { deal_date: '2025-04-30' }))).toBe(false)
})
