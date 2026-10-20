export interface Deal {
  deal_id: string
  city: string
  neighborhood: string
  street: string
  property_type: string
  rooms: number
  size_sqm: number
  floor: number | 'unknown'
  total_floors: number
  year_built: number | 'unknown'
  condition: string
  has_elevator: boolean
  has_parking: boolean
  has_balcony: boolean
  has_safe_room: boolean
  deal_date: string
  price_nis: number
  price_per_sqm: number
  source: string
}

export const dealHeaders = [
  'deal_id', 'city', 'neighborhood', 'street', 'property_type', 'rooms',
  'size_sqm', 'floor', 'total_floors', 'year_built', 'condition',
  'has_elevator', 'has_parking', 'has_balcony', 'has_safe_room',
  'deal_date', 'price_nis', 'price_per_sqm', 'source',
] as const satisfies readonly (keyof Deal)[]

export type RawDeal = Record<keyof Deal, string>
/** Import metadata is separate from source CSV fields and model repair payloads. */
export interface SavedDeal extends Deal {
  row_status: 'original' | 'fixed'
  fixed_fields: readonly (keyof Deal)[]
}

export type DealCollection = readonly Readonly<SavedDeal>[]
export type ValidationResult = { deal: Deal; reasons: [] } | { reasons: string[] }
