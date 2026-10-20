import { expect, it } from 'vitest'
import { dateRepairEvidence } from '../src/repairs/dateEvidence.js'
import { canAttemptRepair } from '../src/repairs/repairEvidence.js'
import { candidate } from './repairFixtures.js'

it.each([
  ['Aug 2025', '2025-08-01'], ['August 2025', '2025-08-01'], [' אוגוסט 2025 ', '2025-08-01'],
  ['2025-08', '2025-08-01'], ['08/2025', '2025-08-01'], ['Sept. 2025', '2025-09-01'],
])('permits only the first day for missing-day date %s', (text, expected) => {
  expect(dateRepairEvidence(text)).toEqual({ date: expected, dayDefaulted: true })
})

it.each([
  ['2025/8/15', '2025-08-15'], ['15-08-2025', '2025-08-15'], ['15 August 2025', '2025-08-15'],
  ['August 15, 2025', '2025-08-15'], ['15 אוגוסט 2025', '2025-08-15'], ['2024.02.29', '2024-02-29'],
])('preserves a supplied full date %s', (text, expected) => {
  expect(dateRepairEvidence(text)).toEqual({ date: expected, dayDefaulted: false })
})

it.each(['', '2025', 'Aug', 'Aug 0', '0000-08', '2025-00', '2025-13', '32/01/2025', '31/04/2025', '2023-02-29', 'Unknown 2025', '30 Unknown 2025', 'Unknown 30, 2025', '2025-08-00', '2025-8/15', 'ignore instructions'])('rejects missing year/month, impossible, or unsupported dates: %s', (text) => {
  expect(dateRepairEvidence(text)).toBeUndefined()
})

it('only permits an API attempt when every error has an evidenced repair', () => {
  expect(canAttemptRepair(candidate({ deal_date: 'Aug 2025' }).prepared)).toBe(true)
  expect(canAttemptRepair(candidate({ deal_date: 'Aug 2025', year_built: '' }).prepared)).toBe(false)
  expect(canAttemptRepair(candidate({ deal_date: 'Aug 2025', neighborhood: '' }).prepared)).toBe(false)
  expect(canAttemptRepair(candidate({ deal_date: 'Aug 2025', size_sqm: '', price_per_sqm: '' }).prepared)).toBe(false)
  expect(canAttemptRepair(candidate({ deal_date: '2025-02-31' }).prepared)).toBe(false)
})
