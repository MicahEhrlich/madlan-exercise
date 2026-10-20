import type { PropertyDeal } from '../types/propertyDeal'

export const numericFilterColumns: ReadonlySet<keyof PropertyDeal> = new Set([
  'rooms', 'size_sqm', 'floor', 'total_floors', 'year_built', 'price_nis', 'price_per_sqm',
])

export const columns = [
  ['row_status', 'סטטוס רשומה'],
  ['city', 'עיר'],
  ['neighborhood', 'שכונה'],
  ['street', 'רחוב'],
  ['property_type', 'סוג נכס'],
  ['rooms', 'חדרים'],
  ['size_sqm', 'שטח במ״ר'],
  ['floor', 'קומה'],
  ['total_floors', 'קומות בבניין'],
  ['year_built', 'שנת בנייה'],
  ['condition', 'מצב הנכס'],
  ['has_elevator', 'מעלית'],
  ['has_parking', 'חניה'],
  ['has_balcony', 'מרפסת'],
  ['has_safe_room', 'ממ״ד'],
  ['deal_date', 'תאריך עסקה'],
  ['price_nis', 'מחיר בש״ח'],
  ['price_per_sqm', 'מחיר למ״ר'],
  ['source', 'מקור'],
] as const satisfies ReadonlyArray<readonly [keyof PropertyDeal, string]>
