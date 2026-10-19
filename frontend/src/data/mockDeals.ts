import type { PropertyDeal } from '../types/propertyDeal'

export const mockDeals: PropertyDeal[] = [
  { city: 'תל אביב–יפו', neighborhood: 'הצפון הישן', street: 'דיזנגוף 120', property_type: 'דירה', rooms: 3, size_sqm: 80, floor: 2, total_floors: 4, year_built: 1970, condition: 'משופצת', has_elevator: false, has_parking: false, has_balcony: true, has_safe_room: false, deal_date: '2026-01-15', price_nis: 4000000, price_per_sqm: 50000, source: 'נתוני דמה' },
  { city: 'רמת גן', neighborhood: 'הגפן', street: 'ביאליק 45', property_type: 'דירה', rooms: 4, size_sqm: 100, floor: 5, total_floors: 8, year_built: 2015, condition: 'שמורה', has_elevator: true, has_parking: true, has_balcony: true, has_safe_room: true, deal_date: '2026-02-10', price_nis: 3200000, price_per_sqm: 32000, source: 'נתוני דמה' },
  { city: 'חיפה', neighborhood: 'נווה שאנן', street: 'טרומפלדור 18', property_type: 'דירת גן', rooms: 3.5, size_sqm: 90, floor: 0, total_floors: 3, year_built: 1990, condition: 'לשיפוץ', has_elevator: false, has_parking: true, has_balcony: false, has_safe_room: false, deal_date: '2026-03-05', price_nis: 1800000, price_per_sqm: 20000, source: 'נתוני דמה' },
  { city: 'באר שבע', neighborhood: 'רמות', street: 'הדעת 8', property_type: 'דירה', rooms: 5, size_sqm: 125, floor: 3, total_floors: 6, year_built: 2020, condition: 'חדשה', has_elevator: true, has_parking: true, has_balcony: true, has_safe_room: true, deal_date: '2026-04-20', price_nis: 2000000, price_per_sqm: 16000, source: 'נתוני דמה' },
]
