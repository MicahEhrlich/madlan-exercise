import { expect, it } from 'vitest'
import { cityName } from '../src/deals/cityName.js'
import { createLocationOptions } from '../src/deals/locationOptions.js'
import { dealsQuerySchema, queryDeals } from '../src/deals/queryDeals.js'
import { neighborhoodDiscounts } from '../src/deals/neighborhoodDiscounts.js'
import { buildComparisons } from '../src/analysis/comparisons.js'
import { parseCachedResponse } from '../src/cache/cachedResponse.js'
import { savedDeal } from './analysisFixtures.js'

it.each([
  ['ב"ש', 'באר שבע'], ['באר-שבע', 'באר שבע'], ['באר שבע', 'באר שבע'],
  ['ת"א', 'תל אביב-יפו'], ['ת״א', 'תל אביב-יפו'], ['תל אביב', 'תל אביב-יפו'],
  ['תל אביב יפו', 'תל אביב-יפו'], ['תל אביב–יפו', 'תל אביב-יפו'],
  ['תל אביב־יפו', 'תל אביב-יפו'], ['\u200fתל  אביב - יפו\u200e', 'תל אביב-יפו'],
  ['בית-שמש', 'בית שמש'], ['מודיעין', 'מודיעין-מכבים-רעות'],
  ['מודיעין מכבים רעות', 'מודיעין-מכבים-רעות'], ['חיפה', 'חיפה'], ['מודיעין עילית', 'מודיעין עילית'],
])('groups the city spelling %s as %s', (raw, canonical) => { expect(cityName(raw)).toBe(canonical) })

it('offers one city option while matching all of its source spellings without mutating rows', () => {
  const spellings = ['ת"א', 'תל אביב', 'תל אביב יפו', 'תל אביב-יפו']
  const rows = spellings.map((city, index) => savedDeal(index + 2, { city, neighborhood: `שכונה ${index}` }))
  const options = createLocationOptions(rows)
  expect(options({}).cities).toEqual(['תל אביב-יפו'])
  expect(options({ city: 'תל אביב-יפו' }).neighborhoods).toHaveLength(4)
  for (const city of [...spellings, 'תל אביב–יפו']) {
    const query = dealsQuerySchema.parse({ city })
    const result = queryDeals(rows, query)
    expect(result.total).toBe(4)
    expect(result.location_options.selected_city).toBe('תל אביב-יפו')
    expect(result.rows.map((row) => row.city)).toEqual(spellings)
    expect(result.filtered_summary.city_comparison?.city).toBe('תל אביב-יפו')
    expect(parseCachedResponse(JSON.stringify(result), query, rows.length)).toEqual(result)
  }
})

it('uses the same city identity for discounted groups and analysis comparisons', () => {
  const rows = ['ב"ש', 'באר שבע', 'באר-שבע', 'באר־שבע'].map((city, index) => savedDeal(index + 2, {
    city, price_per_sqm: index === 0 ? 10000 : 20000,
  }))
  expect([...neighborhoodDiscounts(rows)]).toEqual(['row-2'])
  expect(buildComparisons(rows[0]!, rows)?.baseline.count).toBe(3)
  expect(createLocationOptions(rows)({}).cities).toEqual(['באר שבע'])
})
