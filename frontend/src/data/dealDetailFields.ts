import type { PropertyDealValues } from '../types/propertyDeal'

export const dealDetailFields = [
  ['city', 'עיר', ''], ['street', 'רחוב', ''], ['neighborhood', 'שכונה', ''],
  ['year_built', 'שנת בנייה', ''], ['rooms', 'חדרים', ''], ['size_sqm', 'שטח', 'מ״ר'],
  ['price_nis', 'מחיר', '₪'], ['price_per_sqm', 'מחיר למ״ר', '₪'],
] as const satisfies readonly (readonly [keyof PropertyDealValues, string, string])[]
