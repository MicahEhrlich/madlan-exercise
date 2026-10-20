import { expect, it } from 'vitest'
import { buildComparisons, eligibleForAnalysis, knownLocation } from '../src/analysis/comparisons.js'
import { buildAnalysisEvidence } from '../src/analysis/evidence.js'
import { verifyAnalysis } from '../src/analysis/schema.js'
import { comparableDeals, savedDeal, supportedAnalysis } from './analysisFixtures.js'

it.each([undefined, '', '  ', 'unknown', 'UnKnOwN', ' UNKNOWN '])('does not consider %j a known location', (value) => {
  expect(knownLocation(value)).toBe(false)
  const deal = savedDeal(2, { street: value, neighborhood: value })
  expect(eligibleForAnalysis(deal)).toBe(false)
})

it('allows either local field and selects street first, excluding the target by row ID rather than deal ID', () => {
  const target = savedDeal(2, { neighborhood: 'unknown' })
  const peers = [3, 4, 5].map((id) => savedDeal(id, { deal_id: target.deal_id, price_per_sqm: 25000 }))
  const comparisons = buildComparisons(target, [target, ...peers,
    savedDeal(6, { city: 'ירושלים' }), savedDeal(7, { property_type: 'בית' })])!
  expect(eligibleForAnalysis(target)).toBe(true)
  expect(comparisons.baseline).toEqual({ scope: 'street', count: 3, average_price_per_sqm: 25000,
    first_deal_date: '2024-02-29', last_deal_date: '2024-02-29' })
  expect(comparisons.percentage).toBe(-20)
  expect(comparisons.assessment).toBe('Undervalued')
  expect(comparisons.groups.map((group) => group.scope)).toEqual(['street', 'city'])
})

it('falls back through neighborhood to city and includes small groups as context', () => {
  const target = savedDeal()
  const peers = [savedDeal(3), savedDeal(4, { street: 'אחר' }), savedDeal(5, { street: 'אחר', deal_date: '2023-01-01' })]
  expect(buildComparisons(target, [target, ...peers])!.baseline.scope).toBe('neighborhood')
  expect(buildComparisons(target, [target, ...peers])!.groups[0]!.count).toBe(1)
  const cityPeers = peers.map((row) => ({ ...row, neighborhood: 'אחר' }))
  const comparisons = buildComparisons(target, [target, ...cityPeers])!
  expect(comparisons.baseline.scope).toBe('city')
  expect(comparisons.baseline.first_deal_date).toBe('2023-01-01')
  expect(buildComparisons(savedDeal(2, { street: 'unknown' }), [target, ...peers])!.baseline.scope).toBe('neighborhood')
  expect(buildComparisons(target, [target, ...peers.slice(0, 2)])).toBeUndefined()
})

it.each([
  [9499, -5.01, 'Undervalued'], [9500, -5, 'Fairly Priced'], [10000, 0, 'Fairly Priced'],
  [10500, 5, 'Fairly Priced'], [10501, 5.01, 'Overpriced'], [9499.6, -5, 'Fairly Priced'],
])('computes signed, rounded percentage and assessment for price %s', (price, percentage, assessment) => {
  const target = savedDeal(2, { price_per_sqm: price })
  const comparisons = buildComparisons(target, [target, ...[3, 4, 5].map((id) => savedDeal(id, { price_per_sqm: 10000 }))])!
  expect(comparisons.percentage).toBe(percentage)
  expect(comparisons.assessment).toBe(assessment)
})

it('uses arithmetic rather than size-weighted averages and accepts all transaction dates', () => {
  const target = savedDeal()
  const peers = [savedDeal(3, { price_per_sqm: 10000, size_sqm: 1000 }),
    savedDeal(4, { price_per_sqm: 20000, size_sqm: 50 }), savedDeal(5, { price_per_sqm: 30000, deal_date: '1990-01-01' })]
  expect(buildComparisons(target, [target, ...peers])!.baseline.average_price_per_sqm).toBe(20000)
})

it('rejects nonfinite or nonpositive arithmetic rather than sending it to the model', () => {
  const target = savedDeal()
  expect(buildComparisons(target, [target])).toBeUndefined()
  for (const price of [Infinity, 0]) {
    expect(buildComparisons(target, [target, ...[3, 4, 5].map((id) => savedDeal(id, { price_per_sqm: price }))])).toBeUndefined()
  }
  expect(buildComparisons(savedDeal(2, { price_per_sqm: Number.MAX_VALUE }),
    [3, 4, 5].map((id) => savedDeal(id, { price_per_sqm: Number.MIN_VALUE })))).toBeUndefined()
})

it('builds only supported Hebrew evidence, including known unknowns and repair provenance', () => {
  const target = savedDeal(2, { street: 'unknown', year_built: 'unknown', condition: 'unknown', floor: 'unknown', fixed_fields: ['floor'] })
  const comparisons = buildComparisons(target, comparableDeals())!
  const evidence = buildAnalysisEvidence(target, comparisons)
  expect(evidence.strengths.some((statement) => statement.includes('מעלית'))).toBe(true)
  expect(evidence.risks.some((statement) => statement.includes('שנת הבנייה'))).toBe(true)
  expect(evidence.risks.some((statement) => statement.includes('הרחוב אינו ידוע'))).toBe(true)
  expect(evidence.risks.some((statement) => statement.includes('תוקנו או הושלמו'))).toBe(true)
  const other = buildAnalysisEvidence(savedDeal(2, { neighborhood: 'unknown', condition: 'לשיפוץ', price_per_sqm: 30000 }),
    buildComparisons(savedDeal(2, { price_per_sqm: 30000 }), comparableDeals())!)
  expect(other.risks.some((statement) => statement.includes('גבוה ב־50%'))).toBe(true)
  expect(other.risks.some((statement) => statement.includes('השכונה אינה ידועה'))).toBe(true)
  expect(other.risks.some((statement) => statement.includes('היקף ועלות השיפוץ אינם ידועים'))).toBe(true)
})

it('accepts only exact supplied evidence with matching arithmetic and the mandatory dataset limitation', () => {
  const deal = savedDeal()
  const comparisons = buildComparisons(deal, comparableDeals())!
  const evidence = buildAnalysisEvidence(deal, comparisons)
  const result = supportedAnalysis({ comparisons, evidence })
  expect(verifyAnalysis(JSON.stringify(result), comparisons, evidence)).toEqual(result)
  for (const change of [
    { valuation_assessment: 'Overpriced' }, { estimated_discount_premium_pct: 12 },
    { key_strengths: ['הנכס שופץ לאחרונה'] }, { risk_factors: ['Old building'] },
    { key_strengths: [evidence.strengths[0], evidence.strengths[0]] },
    { risk_factors: [evidence.risks[0], evidence.risks[0]] },
    { risk_factors: [evidence.risks[1]] }, { unexpected: true }, { risk_factors: [] },
  ]) expect(() => verifyAnalysis(JSON.stringify({ ...result, ...change }), comparisons, evidence)).toThrow()
  expect(() => verifyAnalysis('not JSON', comparisons, evidence)).toThrow()
})
