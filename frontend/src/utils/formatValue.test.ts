import { expect, it } from 'vitest'
import { formatValue } from './formatValue'

it('displays unknown property values in Hebrew', () => {
  expect(formatValue('unknown')).toBe('לא ידוע')
  expect(formatValue(1990)).toBe('1,990')
  expect(formatValue('הדר')).toBe('הדר')
})
