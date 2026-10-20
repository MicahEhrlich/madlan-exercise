import { expect, it } from 'vitest'
import { isImportSummary } from './fetchImportSummary'

it.each([
  null, [], {}, { total_rows: 2, parsed_rows: 3, completed_rows: 0 },
  { total_rows: 3, parsed_rows: 2, completed_rows: 3 },
  { total_rows: -1, parsed_rows: 0, completed_rows: 0 },
  { total_rows: 1.5, parsed_rows: 1, completed_rows: 0 },
  { total_rows: '530', parsed_rows: 510, completed_rows: 100 },
])('rejects invalid summary counts: %j', (value) => {
  expect(isImportSummary(value)).toBe(false)
})
