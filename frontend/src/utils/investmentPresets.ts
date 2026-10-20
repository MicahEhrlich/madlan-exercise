import { investmentPresets } from '../data/investmentPresets'
import type { InvestmentPresetId } from '../data/investmentPresets'
import type { DealFilters, FilterKey } from './filterDeals'

export function isInvestmentPresetActive(filters: DealFilters, id: InvestmentPresetId): boolean {
  const preset = investmentPresets.find((candidate) => candidate.id === id)!
  return Object.entries(preset.filters).every(([key, value]) => filters[key as FilterKey] === value)
}

export function toggleInvestmentPreset(filters: DealFilters, id: InvestmentPresetId): DealFilters {
  const preset = investmentPresets.find((candidate) => candidate.id === id)!
  const next = { ...filters }
  if (isInvestmentPresetActive(filters, id)) {
    for (const key of Object.keys(preset.filters)) delete next[key as FilterKey]
  } else {
    if (id === 'new_build') delete next.year_built
    Object.assign(next, preset.filters)
  }
  return next
}
