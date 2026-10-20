import type { PropertyDeal } from '../types/propertyDeal'

const numberFormatter = new Intl.NumberFormat('he-IL')

export function formatValue(value: PropertyDeal[keyof PropertyDeal], key?: keyof PropertyDeal) {
  if (key === 'row_status') return value === 'fixed' ? 'הושלמו על ידי המערכת' : 'מקורית'
  if (value === 'unknown') return 'לא ידוע'
  if (typeof value === 'boolean') return value ? 'כן' : 'לא'
  if (typeof value === 'number') return numberFormatter.format(value)
  return value
}
