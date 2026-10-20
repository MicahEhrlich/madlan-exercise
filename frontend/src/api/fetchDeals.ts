import type { DealsPage } from '../types/dealsPage'
import { columns } from '../data/dealColumns'
import { fetchWhenReady } from './fetchWhenReady'
import { isFilteredSummary } from './isFilteredSummary'
import { isLocationOptions } from './isLocationOptions'
import { isFilterOptions } from './isFilterOptions'

/** Reject malformed responses before they reach table formatting or pagination. */
export function isDealsPage(value: unknown): value is DealsPage {
  if (!value || typeof value !== 'object') return false
  const page = value as Record<string, unknown>
  if (!['page', 'count', 'total', 'total_pages'].every((key) =>
    typeof page[key] === 'number' && Number.isSafeInteger(page[key]) && page[key] >= 0,
  )) return false
  if ((page.page as number) < 1 || (page.count as number) < 1 || (page.count as number) > 100 ||
    page.total_pages !== Math.ceil((page.total as number) / (page.count as number))) return false
  if (!Array.isArray(page.rows) || page.rows.length > (page.count as number) || page.rows.length > (page.total as number)) return false
  if ('filtered_summary' in page && !isFilteredSummary(page.filtered_summary, page.total as number)) return false
  if ('location_options' in page && !isLocationOptions(page.location_options)) return false
  if ('filter_options' in page && !isFilterOptions(page.filter_options)) return false
  return page.rows.every((row: unknown) => {
    if (!row || typeof row !== 'object') return false
    const deal = row as Record<string, unknown>
    if (typeof deal.row_id !== 'string' || !/^row-[1-9]\d*$/.test(deal.row_id) ||
      !Number.isSafeInteger(Number(deal.row_id.slice(4))) || Number(deal.row_id.slice(4)) < 2) return false
    const allowedFields = ['deal_id', ...columns.filter(([key]) => key !== 'row_status').map(([key]) => key)]
    if (!Array.isArray(deal.fixed_fields) || !deal.fixed_fields.every((field: unknown) =>
      typeof field === 'string' && allowedFields.includes(field),
    )) return false
    if (new Set(deal.fixed_fields).size !== deal.fixed_fields.length ||
      (deal.row_status === 'fixed') !== (deal.fixed_fields.length > 0)) return false
    return columns.every(([key]) => {
      const field = deal[key]
      if (key === 'row_status') return field === 'original' || field === 'fixed'
      if (key.startsWith('has_')) return typeof field === 'boolean'
      if (['rooms', 'size_sqm', 'floor', 'total_floors', 'year_built', 'price_nis', 'price_per_sqm'].includes(key)) {
        return ((key === 'floor' || key === 'year_built') && field === 'unknown') ||
          (typeof field === 'number' && Number.isFinite(field))
      }
      return typeof field === 'string'
    })
  })
}

export async function fetchDeals(page: number, count: number, signal: AbortSignal, filterQuery: string, onProcessing: () => void): Promise<DealsPage> {
  const params = new URLSearchParams({ page: String(page), count: String(count) })
  new URLSearchParams(filterQuery).forEach((value, key) => params.set(key, value))
  const response = await fetchWhenReady(`/deals?${params}`, signal, onProcessing)
  if (!response.ok) throw new Error('לא ניתן לטעון את העסקאות מהשרת.')
  const data: unknown = await response.json()
  if (!isDealsPage(data) || data.page !== page || data.count !== count) throw new Error('התקבלו נתונים לא תקינים מהשרת.')
  const filters = new URLSearchParams(filterQuery)
  if (data.location_options && (data.location_options.scope.city !== (filters.get('city')?.trim() || null) ||
    data.location_options.scope.neighborhood !== (filters.get('neighborhood')?.trim() || null))) {
    throw new Error('התקבלו אפשרויות מיקום שאינן תואמות לסינון.')
  }
  return data
}
