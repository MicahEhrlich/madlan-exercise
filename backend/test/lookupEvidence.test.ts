import { expect, it } from 'vitest'
import type { Message } from '@anthropic-ai/sdk/resources/messages'
import { parseLookupResponse, needsLookup } from '../src/repairs/lookupEvidence.js'
import { canAttemptRepair, isVerifiedRepair } from '../src/repairs/repairEvidence.js'
import { verifyRepairReport } from '../src/repairs/verifyRepair.js'
import { candidate, proposed, report } from './repairFixtures.js'

const url = 'https://city.example/streets/herzl'
const quote = 'בחיפה ברחוב הרצל כל הרחוב נמצא בשכונת הדר.'
const yearQuote = 'חיפה הרצל: all buildings were built in 1990.'
const neighborhoodRow = () => candidate({ neighborhood: '' })
function proof(field = 'neighborhood', value: string | number = 'הדר', excerpt = quote) {
  return { deal_id: 'D1', city: 'חיפה', street: 'הרצל', source: 'רשות המסים', field, value, source_url: url, quote: excerpt, scope: 'entire_street' }
}
function message(value: unknown, excerpts = [quote], retrieved = [url]): Message {
  return { content: [
    { type: 'text', text: 'Searching…' },
    { type: 'web_search_tool_result', content: retrieved.map((link) => ({ type: 'web_search_result', url: link })) },
    { type: 'text', text: JSON.stringify(value), citations: excerpts.map((excerpt) => ({ type: 'web_search_result_location', url, cited_text: excerpt })) },
  ] } as unknown as Message
}

it('accepts a retrieved, cited, explicit street-wide neighborhood claim and records provenance', () => {
  const row = neighborhoodRow()
  const fixed = proposed(row, { neighborhood: 'הדר' })
  const result = parseLookupResponse(message({ ...report([fixed]), lookup_evidence: [proof()] }), [row])
  expect(result.facts).toEqual([expect.objectContaining({ source: 'רשות המסים', field: 'neighborhood', value: 'הדר', url, quote })])
  expect(verifyRepairReport(JSON.stringify(result.report), [row], result.facts)).toEqual(report([fixed]))
  expect(isVerifiedRepair(row, fixed)).toBe(false)
})

it('accepts an exact source-backed year only when the citation explicitly covers all buildings', () => {
  const row = candidate({ year_built: '' })
  const fixed = proposed(row, { year_built: 1990 })
  const result = parseLookupResponse(message({ ...report([fixed]), lookup_evidence: [proof('year_built', 1990, yearQuote)] }, [yearQuote]), [row])
  expect(result.facts).toHaveLength(1)
  expect(isVerifiedRepair(row, fixed, result.facts)).toBe(true)
})

it('preserves the row provider label independently of the supporting webpage and verifies the binding', () => {
  const row = candidate({ neighborhood: '', source: '  רשות המיסים  ' })
  const fixed = proposed(row, { neighborhood: 'הדר' })
  const result = parseLookupResponse(message({ ...report([fixed]), lookup_evidence: [{ ...proof(), source: ' רשות המיסים ' }] }), [row])
  expect(result.facts).toEqual([expect.objectContaining({ source: 'רשות המיסים', url })])
  expect(verifyRepairReport(JSON.stringify(result.report), [row], result.facts)).toEqual(report([fixed]))
  expect(fixed.source).toBe('רשות המיסים')
  expect(isVerifiedRepair(row, fixed, result.facts.map((fact) => ({ ...fact, source: 'other provider' })))).toBe(false)
})

it.each([undefined, null, 42, ' '])('rejects missing or malformed evidence source: %j', (source) => {
  const row = neighborhoodRow()
  expect(() => parseLookupResponse(message({ ...report([proposed(row, { neighborhood: 'הדר' })]),
    lookup_evidence: [{ ...proof(), source }],
  }), [row])).toThrow()
})

it('retains unknown years as explicit missing values', () => {
  const row = candidate({ year_built: '', has_safe_room: 'yes' })
  const body = { ...report(), auto_corrected: 1, auto_corrected_rows: [{ ...proposed(row), year_built: 'unknown' }], lookup_evidence: [] }
  const result = parseLookupResponse(message(body, [], []), [row])
  expect(result.report).toEqual(report([proposed(row, { year_built: 'unknown' })]))
  expect(verifyRepairReport(JSON.stringify(result.report), [row], result.facts)).toEqual(result.report)
})

it('retains unknown neighborhoods as explicit missing values', () => {
  const row = neighborhoodRow()
  const result = parseLookupResponse(message({ ...report([proposed(row, { neighborhood: 'unknown' })]), lookup_evidence: [] }), [row])
  expect(result.report).toEqual(report([proposed(row, { neighborhood: 'unknown' })]))
  expect(verifyRepairReport(JSON.stringify(result.report), [row], result.facts)).toEqual(result.report)
})

it('retains a sourced neighborhood alongside an unknown construction year', () => {
  const row = candidate({ neighborhood: '', year_built: '' })
  const fixed = proposed(row, { neighborhood: 'הדר', year_built: 'unknown' })
  const result = parseLookupResponse(message({ ...report([fixed]), lookup_evidence: [proof()] }), [row])
  expect(verifyRepairReport(JSON.stringify(result.report), [row], result.facts)).toEqual(report([fixed]))
  expect(isVerifiedRepair(row, fixed)).toBe(false)
})

it('never replaces supplied facts with unknown or hides malformed construction years', () => {
  const row = candidate()
  expect(isVerifiedRepair(row, proposed(row, { year_built: 'unknown' }))).toBe(false)
  expect(isVerifiedRepair(row, proposed(row, { neighborhood: 'unknown' }))).toBe(false)
  const malformed = candidate({ year_built: 'invalid' })
  expect(isVerifiedRepair(malformed, proposed(malformed, { year_built: 'unknown' }))).toBe(false)
})

it.each([
  { city: 'ירושלים' }, { source_url: 'https://fabricated.example' }, { source_url: 'http://city.example/streets/herzl' },
  { quote: '' }, { quote: 'invented supporting text' }, { value: 1990 },
  { source: 'a different provider' },
])('rejects unsupported neighborhood evidence: %j', (changes) => {
  const row = neighborhoodRow()
  const result = parseLookupResponse(message({ ...report([proposed(row, { neighborhood: 'הדר' })]), lookup_evidence: [{ ...proof(), ...changes }] }), [row])
  expect(result.facts).toHaveLength(0)
  expect(verifyRepairReport(JSON.stringify(result.report), [row], result.facts)).toEqual(report([], [row.original]))
})

it('does not trust a citation unless its URL also appeared in actual tool results', () => {
  const row = neighborhoodRow()
  expect(parseLookupResponse(message({ ...report([proposed(row, { neighborhood: 'הדר' })]), lookup_evidence: [proof()] }, [quote], []), [row]).facts).toHaveLength(0)
})

it.each([
  'חיפה הרצל נמצא בשכונת הדר.',
  'חיפה הרצל: לא כל הרחוב נמצא בשכונת הדר.',
  'The entire street is in הדר in ירושלים.',
])('rejects ambiguous, negated, or mismatched street claims: %s', (excerpt) => {
  const row = neighborhoodRow()
  expect(parseLookupResponse(message({ ...report([proposed(row, { neighborhood: 'הדר' })]), lookup_evidence: [proof('neighborhood', 'הדר', excerpt)] }, [excerpt]), [row]).facts).toHaveLength(0)
})

it.each([
  ['Built in 1990 in חיפה הרצל.', 1990],
  ['חיפה הרצל: all buildings were built before 1990.', 1990],
  ['חיפה הרצל: all buildings were built in 19901.', 1990],
  ['חיפה הרצל: all buildings were built in 1990.', '1990'],
  ['חיפה הרצל: all buildings were built in 0.', 0],
] as const)('rejects unsupported or estimated construction year: %s', (excerpt, value) => {
  const row = candidate({ year_built: '' })
  expect(parseLookupResponse(message({ ...report([proposed(row, { year_built: 1990 })]), lookup_evidence: [proof('year_built', value, excerpt)] }, [excerpt]), [row]).facts).toHaveLength(0)
})

it('rejects conflicting sourced neighborhoods rather than choosing one', () => {
  const row = neighborhoodRow()
  const conflictingQuote = 'בחיפה ברחוב הרצל כל הרחוב נמצא בשכונת כרמל.'
  const result = parseLookupResponse(message({ ...report([proposed(row, { neighborhood: 'הדר' })]), lookup_evidence: [proof(), proof('neighborhood', 'כרמל', conflictingQuote)] }, [quote, conflictingQuote]), [row])
  expect(result.facts).toHaveLength(0)
})

it('never overwrites a supplied valid fact with lookup evidence', () => {
  const row = candidate()
  const result = parseLookupResponse(message({ ...report([proposed(row)]), lookup_evidence: [proof()] }), [row])
  expect(result.facts).toHaveLength(0)
})

it('rejects bad accounting and unknown lookup rows', () => {
  const row = neighborhoodRow()
  expect(() => parseLookupResponse(message({ ...report(), lookup_evidence: [] }), [row])).toThrow('accounting')
  expect(() => parseLookupResponse(message({ ...report([proposed(row, { deal_id: 'other' })]), lookup_evidence: [] }), [row])).toThrow('Unknown lookup result')
})

it('permits lookup only if all other errors remain repairable', () => {
  const row = candidate({ year_built: '' })
  expect(needsLookup(row)).toBe(true)
  expect(canAttemptRepair(row.prepared)).toBe(false)
  expect(canAttemptRepair(row.prepared, true)).toBe(true)
  expect(canAttemptRepair(candidate({ neighborhood: '', year_built: '' }).prepared, true)).toBe(true)
  expect(canAttemptRepair(candidate({ year_built: '', size_sqm: '', price_per_sqm: '' }).prepared, true)).toBe(false)
  expect(canAttemptRepair(candidate({ neighborhood: '', rooms: '' }).prepared, true)).toBe(false)
  expect(canAttemptRepair(candidate({ year_built: 'unknown' }).prepared, true)).toBe(true)
})
