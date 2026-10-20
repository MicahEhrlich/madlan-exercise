export interface PropertyDealValues {
  row_status: 'original' | 'fixed'
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

export type FixedField = Exclude<keyof PropertyDealValues, 'row_status'> | 'deal_id'

export interface PropertyDeal extends PropertyDealValues {
  row_id: string
  fixed_fields: readonly FixedField[]
}
