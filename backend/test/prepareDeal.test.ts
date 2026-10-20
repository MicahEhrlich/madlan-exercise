import { expect, it } from 'vitest'
import { prepareDeal } from '../src/deals/prepareDeal.js'
import { validRow } from './fixtures.js'

it.each(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])('defaults the missing day in %s YYYY without changing the input', (month) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const original = { ...validRow, deal_date: `${month} 2023` }
  const expected = `2023-${String(months.indexOf(month) + 1).padStart(2, '0')}-01`
  const prepared = prepareDeal(original)
  expect(prepared.result).toMatchObject({ deal: { deal_date: expected }, reasons: [] })
  expect(prepared.corrections).toEqual([{ field: 'deal_date', original: original.deal_date, corrected: expected, kind: 'default' }])
  expect(original.deal_date).toBe(`${month} 2023`)
})

it('accepts case differences and surrounding whitespace in month/year dates', () => {
  expect(prepareDeal({ ...validRow, deal_date: '  mAr   2023  ' }).result).toMatchObject({ deal: { deal_date: '2023-03-01' } })
})

it.each(['Foo 2023', 'Mar 0000', 'Mar', '2023', '2023-02-29', '31/04/2023', 'Mar 2023 extra'])('keeps invalid or incomplete dates rejected: %s', (deal_date) => {
  const prepared = prepareDeal({ ...validRow, deal_date })
  expect(prepared.corrected).toBe(false)
  expect(prepared.result.reasons).toContain('deal_date: expected a valid exact date (YYYY-MM-DD, DD/MM/YYYY, or DD.MM.YYYY)')
})

it.each(['2023-03-17', '17/03/2023', '17.03.2023'])('preserves the supplied day in %s', (deal_date) => {
  expect(prepareDeal({ ...validRow, deal_date })).toMatchObject({ corrected: false, result: { deal: { deal_date: '2023-03-17' } } })
})

it.each(['', '0', 'wrong', '100', '20001.1'])('derives bad or missing unit price %s without changing the input', (unit) => {
  const original = { ...validRow, price_per_sqm: unit }
  const prepared = prepareDeal(original)
  expect(prepared.corrected).toBe(true)
  expect(prepared.raw.price_per_sqm).toBe('20000')
  expect(prepared.result.reasons).toEqual([])
  expect(original.price_per_sqm).toBe(unit)
})

it.each(['20000', '19999', '20001'])('preserves consistent unit price %s', (unit) => {
  const original = { ...validRow, price_per_sqm: unit }
  expect(prepareDeal(original)).toMatchObject({ raw: original, corrected: false })
})

it.each([
  { price_nis: '0' }, { price_nis: 'bad' }, { size_sqm: '' }, { size_sqm: '0' },
  { price_nis: '9'.repeat(400) },
])('does not invent a unit price when supplied operands are unusable: %j', (changes) => {
  const raw = { ...validRow, ...changes, price_per_sqm: '' }
  const result = prepareDeal(raw)
  expect(result.result.reasons.length).toBeGreaterThan(0)
})

it.each([
  { price_nis: '', expected: 2000000, field: 'price_nis' },
  { price_nis: 'bad', expected: 2000000, field: 'price_nis' },
  { price_nis: '0', expected: 2000000, field: 'price_nis' },
  { size_sqm: '', expected: 100, field: 'size_sqm' },
  { size_sqm: 'bad', expected: 100, field: 'size_sqm' },
  { size_sqm: '-10', expected: 100, field: 'size_sqm' },
] as const)('calculates one missing or invalid financial value: %j', ({ expected, field, ...changes }) => {
  const prepared = prepareDeal({ ...validRow, ...changes })
  expect(prepared.result).toHaveProperty('deal')
  if ('deal' in prepared.result) expect(prepared.result.deal[field]).toBe(expected)
  expect(prepared.corrections).toEqual([expect.objectContaining({ field, kind: 'derived' })])
})

it('defaults only missing condition, floor, and parking and logs each default', () => {
  const original = { ...validRow, condition: ' ', floor: '', has_parking: '\t' }
  const prepared = prepareDeal(original)
  expect(prepared.result).toMatchObject({ deal: { condition: 'unknown', floor: 'unknown', has_parking: false }, reasons: [] })
  expect(prepared.corrections).toEqual([
    { field: 'condition', original: ' ', corrected: 'unknown', kind: 'default' },
    { field: 'floor', original: '', corrected: 'unknown', kind: 'default' },
    { field: 'has_parking', original: '\t', corrected: 'false', kind: 'default' },
  ])
  expect(original.floor).toBe('')
})

it('preserves provided condition, ground floor, and explicit parking', () => {
  const raw = { ...validRow, floor: '0', has_parking: 'yes', condition: 'דורש שיפוץ' }
  expect(prepareDeal(raw)).toMatchObject({ corrected: false, corrections: [], raw })
})

it('does not default malformed nonempty floor or parking', () => {
  const prepared = prepareDeal({ ...validRow, floor: 'invalid', has_parking: 'maybe' })
  expect(prepared.corrected).toBe(false)
  expect(prepared.result.reasons).toEqual(expect.arrayContaining(['floor: expected a nonnegative integer', 'has_parking: unrecognized boolean']))
})

it.each([
  { size_sqm: '', price_per_sqm: '' },
  { price_nis: '', size_sqm: '' },
  { price_nis: '', price_per_sqm: '' },
])('does not infer two unknown financial values: %j', (changes) => {
  const prepared = prepareDeal({ ...validRow, ...changes })
  expect(prepared.corrected).toBe(false)
  expect(prepared.result.reasons.length).toBeGreaterThan(0)
})

it('rejects overflow and underflow rather than saving zero or infinite derived values', () => {
  const huge = '1' + '0'.repeat(308)
  expect(prepareDeal({ ...validRow, price_nis: '', size_sqm: huge, price_per_sqm: '100' }).result.reasons.length).toBeGreaterThan(0)
  expect(prepareDeal({ ...validRow, size_sqm: '', price_nis: huge, price_per_sqm: '0.01' }).result.reasons.length).toBeGreaterThan(0)
  expect(prepareDeal({ ...validRow, price_nis: '', size_sqm: '0.' + '0'.repeat(199) + '1', price_per_sqm: '0.' + '0'.repeat(199) + '1' }).result.reasons.length).toBeGreaterThan(0)
})

it('serializes very small derived values without scientific notation', () => {
  const prepared = prepareDeal({ ...validRow, price_nis: '1', size_sqm: '9'.repeat(308), price_per_sqm: '' })
  expect(prepared.result.reasons).toEqual([])
  expect(prepared.raw.price_per_sqm).not.toContain('e')
  expect(Number(prepared.raw.price_per_sqm)).toBeGreaterThan(0)
})
