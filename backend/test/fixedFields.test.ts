import { expect, it } from 'vitest'
import { fixedFields } from '../src/deals/fixedFields.js'
import { inspectDeal } from '../src/deals/validateDeal.js'
import { validRow } from './fixtures.js'

it('does not flag standard whitespace, numeric, boolean, date, or explicit unknown normalization', () => {
  const original = {
    ...validRow, deal_id: ' D1 ', city: ' חיפה ', rooms: '3 חדרים',
    price_nis: '₪ 2,000,000', has_elevator: 'YES', has_parking: 'FALSE',
    deal_date: '29/02/2024', floor: 'unknown', year_built: 'unknown',
  }
  expect(fixedFields(original, inspectDeal(original).deal)).toEqual([])
})

it('includes only changed valid values and repaired invalid fields in CSV column order', () => {
  const original = { ...validRow, price_per_sqm: '999', has_parking: 'אין', year_built: '' }
  const saved = { ...inspectDeal(validRow).deal, year_built: 'unknown' as const }
  const fields = fixedFields(original, saved)
  expect(fields).toEqual(['year_built', 'has_parking', 'price_per_sqm'])
  expect(new Set(fields).size).toBe(fields.length)
  expect(Object.isFrozen(fields)).toBe(true)
})
