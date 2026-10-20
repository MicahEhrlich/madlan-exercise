import { expect, it } from 'vitest'
import { isInvestmentPresetActive, toggleInvestmentPreset } from './investmentPresets'
import type { DealFilters } from './filterDeals'

it('toggles and combines presets while preserving unrelated filters without mutating them', () => {
  const original: DealFilters = { city: 'חיפה', rooms: '3', price_nis_max: '2000000' }
  const first = toggleInvestmentPreset(original, 'attractive')
  const combined = toggleInvestmentPreset(toggleInvestmentPreset(first, 'new_build'), 'full_package')
  for (const id of ['attractive', 'new_build', 'full_package'] as const) expect(isInvestmentPresetActive(combined, id)).toBe(true)
  expect(original).toEqual({ city: 'חיפה', rooms: '3', price_nis_max: '2000000' })
  expect(toggleInvestmentPreset(combined, 'full_package')).toEqual({ ...original, below_neighborhood_average: 'true', year_built_min: '2020' })
  expect(toggleInvestmentPreset(first, 'attractive')).toEqual(original)
  expect(toggleInvestmentPreset(toggleInvestmentPreset(original, 'new_build'), 'new_build')).toEqual(original)
})

it('overrides conflicting build-year and amenity choices and derives active state from actual filters', () => {
  expect(toggleInvestmentPreset({ year_built: '1990', city: 'חיפה' }, 'new_build')).toEqual({ year_built_min: '2020', city: 'חיפה' })
  expect(toggleInvestmentPreset({ has_parking: 'false' }, 'full_package')).toEqual({ has_parking: 'true', has_safe_room: 'true', has_elevator: 'true' })
  expect(isInvestmentPresetActive({ has_parking: 'true', has_safe_room: 'true', has_elevator: 'false' }, 'full_package')).toBe(false)
})
