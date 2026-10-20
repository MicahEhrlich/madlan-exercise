import { dealHeaders } from './types.js'
import type { SavedDeal } from './types.js'

const numberFormatter = new Intl.NumberFormat('he-IL')

/** Search the raw and Hebrew display values of the table's columns. */
export function matchesDealSearch(deal: Readonly<SavedDeal>, query: string): boolean {
  const search = query.trim().toLocaleLowerCase('he-IL')
  if (!search) return true
  const keys = [...dealHeaders.filter((key) => key !== 'deal_id'), 'row_status'] as const
  return keys.some((key) => {
    const value = deal[key]
    let display: string
    if (key === 'row_status') display = value === 'fixed' ? 'הושלמו על ידי המערכת' : 'מקורית'
    else if (value === 'unknown') display = 'לא ידוע'
    else if (typeof value === 'boolean') display = value ? 'כן' : 'לא'
    else if (typeof value === 'number') display = numberFormatter.format(value)
    else display = value
    return `${value} ${display}`.toLocaleLowerCase('he-IL').includes(search)
  })
}
