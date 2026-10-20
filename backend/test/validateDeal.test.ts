import { describe, expect, it } from 'vitest'
import { validateDeal } from '../src/deals/validateDeal.js'
import { dealHeaders } from '../src/deals/types.js'
import type { RawDeal } from '../src/deals/types.js'
import { validRow } from './fixtures.js'

function validate(changes: Partial<RawDeal> = {}) {
  return validateDeal({ ...validRow, ...changes })
}

describe('deal validation', () => {
  it('converts numeric fields and preserves supported text without guessing aliases', () => {
    const result = validate({ city: ' Tel Aviv-Yafo ', rooms: '3.5 חדרים', price_nis: '₪ 2,000,000', price_per_sqm: '20,000' })
    expect(result).toMatchObject({ deal: { city: 'Tel Aviv-Yafo', rooms: 3.5, price_nis: 2000000, price_per_sqm: 20000, floor: 0 }, reasons: [] })
  })

  it.each(['כן', 'yes', 'TRUE', '1', ' Yes '])('accepts true boolean %s', (value) => {
    expect(validate({ has_elevator: value })).toMatchObject({ deal: { has_elevator: true } })
  })
  it.each(['לא', 'no', 'FALSE', '0', ' No '])('accepts false boolean %s', (value) => {
    expect(validate({ has_elevator: value })).toMatchObject({ deal: { has_elevator: false } })
  })
  it.each(dealHeaders)('rejects missing %s', (key) => {
    expect(validate({ [key]: '  ' }).reasons).toContain(`${key}: required value is missing`)
  })
  it.each(['2024-02-29', '29/02/2024', '29.02.2024'])('normalizes exact date %s', (value) => {
    expect(validate({ deal_date: value })).toMatchObject({ deal: { deal_date: '2024-02-29' } })
  })
  it.each(['2023-02-29', '31/04/2024', '2024-13-01', 'Aug 2025', '2025-08', '0000-01-01', '01/02.2024', 'nonsense'])('rejects invalid or incomplete date %s', (value) => {
    expect(validate({ deal_date: value }).reasons.some((reason) => reason.startsWith('deal_date:'))).toBe(true)
  })
  it.each([
    { rooms: '3abc' }, { rooms: '0' }, { size_sqm: '-10' }, { size_sqm: 'Infinity' },
    { floor: '1.5' }, { floor: '-1' }, { total_floors: '2.5' }, { year_built: '0' },
    { year_built: '1990.5' }, { price_nis: '20,00,000' }, { price_nis: '0' },
    { price_per_sqm: '0' }, { has_parking: 'maybe' }, { price_nis: '9'.repeat(400) },
  ])('rejects malformed or out-of-range values: %j', (changes) => {
    expect(validate(changes).reasons.length).toBeGreaterThan(0)
  })
  it('collects multiple errors and rejects floors above the building height', () => {
    const result = validate({ floor: '5', has_parking: 'unknown', city: '' })
    expect(result.reasons).toEqual(expect.arrayContaining(['floor: exceeds total_floors', 'has_parking: unrecognized boolean', 'city: required value is missing']))
    expect(result).not.toHaveProperty('deal')
  })
  it.each(['19999', '20001'])('accepts rounding difference of exactly one: %s', (price) => {
    expect(validate({ price_per_sqm: price }).reasons).toEqual([])
  })
  it.each(['19998.99', '20001.01'])('rejects rounding difference over one: %s', (price) => {
    expect(validate({ price_per_sqm: price }).reasons).toContain('price_per_sqm: differs from price_nis / size_sqm by more than 1 NIS/m²')
  })
  it('accepts unusual but consistent prices and ground-level buildings', () => {
    expect(validate({ price_nis: '1000000000', price_per_sqm: '10000000', total_floors: '0' }).reasons).toEqual([])
  })
})
