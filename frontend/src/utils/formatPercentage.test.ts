import { expect, it } from 'vitest'
import { formatPercentage } from './formatPercentage'

it('formats rates with at most one decimal place', () => {
  expect(formatPercentage(1510, 1530)).toBe('98.7%')
  expect(formatPercentage(100, 1510)).toBe('6.6%')
  expect(formatPercentage(20, 1530)).toBe('1.3%')
})

it('distinguishes zero percent from an undefined empty-population rate', () => {
  expect(formatPercentage(0, 10)).toBe('0%')
  expect(formatPercentage(10, 10)).toBe('100%')
  expect(formatPercentage(0, 0)).toBe('—')
})
