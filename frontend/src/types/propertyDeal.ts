export interface PropertyDeal {
  city: string
  neighborhood: string
  street: string
  property_type: string
  rooms: number
  size_sqm: number
  floor: number
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
