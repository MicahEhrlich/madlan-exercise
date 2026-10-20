import type { PropertyDeal } from '../types/propertyDeal'

const numberFormatter = new Intl.NumberFormat('he-IL')

export function formatValue(value: PropertyDeal[keyof PropertyDeal]) {
  if (value === 'unknown') return 'לא ידוע'
  if (typeof value === 'boolean') return value ? 'כן' : 'לא'
  if (typeof value === 'number') return numberFormatter.format(value)
  return value
}
