import { afterEach, expect, it, vi } from 'vitest'
import { fetchDealAnalysis, isDealAnalysisResult } from './fetchDealAnalysis'

const valid = { valuation_assessment: 'Undervalued', estimated_discount_premium_pct: -12,
  key_strengths: ['מחיר נמוך ביחס לנתונים'], risk_factors: ['השוואה לנתונים שנקלטו בלבד'] }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each([
  [-12, 'Undervalued'], [-5, 'Fairly Priced'], [0, 'Fairly Priced'], [5, 'Fairly Priced'], [12, 'Overpriced'],
])('validates assessment and percentage %s', (percentage, assessment) => {
  expect(isDealAnalysisResult({ ...valid, estimated_discount_premium_pct: percentage, valuation_assessment: assessment })).toBe(true)
})

it('accepts unavailable and empty strengths', () => {
  expect(isDealAnalysisResult({ status: 'unavailable' })).toBe(true)
  expect(isDealAnalysisResult({ ...valid, key_strengths: [] })).toBe(true)
})

it.each([
  null, [], 'unavailable', {}, { status: 'error' }, { status: 'unavailable', other: true },
  { ...valid, extra: true }, { ...valid, valuation_assessment: 'Cheap' },
  { ...valid, valuation_assessment: 'Overpriced' }, { ...valid, estimated_discount_premium_pct: NaN },
  { ...valid, estimated_discount_premium_pct: Infinity }, { ...valid, estimated_discount_premium_pct: '-12' },
  { ...valid, estimated_discount_premium_pct: -101 }, { ...valid, key_strengths: 'text' },
  { ...valid, key_strengths: [null] }, { ...valid, key_strengths: [''] }, { ...valid, key_strengths: [' '] },
  { ...valid, risk_factors: [] }, { ...valid, risk_factors: ['duplicate', 'duplicate'] },
  { ...valid, risk_factors: ['x'.repeat(1001)] }, { ...valid, key_strengths: Array.from({ length: 9 }, (_, i) => String(i)) },
])('rejects malformed responses: %j', (response) => {
  expect(isDealAnalysisResult(response)).toBe(false)
})

it('uses the configured API address, encodes row IDs, and forwards cancellation', async () => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(valid)))
  vi.stubGlobal('fetch', fetchMock)
  const signal = new AbortController().signal
  expect(await fetchDealAnalysis('row/2', signal, vi.fn())).toEqual(valid)
  expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/deals/row%2F2/analysis', { signal })
})

it.each([new Response('', { status: 503 }), new Response('{'), new Response('{}')])('rejects unsuccessful or malformed API responses', async (response) => {
  vi.stubGlobal('fetch', vi.fn(async () => response))
  await expect(fetchDealAnalysis('row-2', new AbortController().signal, vi.fn())).rejects.toThrow()
})
