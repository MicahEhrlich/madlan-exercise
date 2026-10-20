import type { DealFilters } from '../utils/filterDeals'

export const investmentPresets = [
  { id: 'attractive', label: 'אטרקטיביות (מתחת למחיר ממוצע)', filters: { below_neighborhood_average: 'true' } },
  { id: 'new_build', label: 'בנייה חדשה (2020+)', filters: { year_built_min: '2020' } },
  { id: 'full_package', label: 'החבילה המלאה (חניה + ממ"ד + מעלית)',
    filters: { has_parking: 'true', has_safe_room: 'true', has_elevator: 'true' } },
] as const satisfies readonly { id: string; label: string; filters: DealFilters }[]

export type InvestmentPresetId = typeof investmentPresets[number]['id']
