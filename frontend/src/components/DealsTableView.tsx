import { useState } from 'react'
import { columns, numericFilterColumns } from '../data/dealColumns'
import type { PropertyDeal } from '../types/propertyDeal'
import type { DealFilters, FilterKey, RangeField } from '../utils/filterDeals'
import { hasInvalidRanges } from '../utils/filterDeals'
import { formatValue } from '../utils/formatValue'
import ColumnFilter from './ColumnFilter'
import SearchBar from './SearchBar'
import DealCell from './DealCell'
import RangeFilter from './RangeFilter'

interface DealsTableViewProps {
  deals: PropertyDeal[]
  total: number
  query: string
  filters: DealFilters
  onQueryChange: (value: string) => void
  onFilterChange: (key: FilterKey, value: string) => void
  onRangeApply: (ranges: DealFilters) => void
  onReset: () => void
}

export default function DealsTableView({ deals, total, query, filters, onQueryChange, onFilterChange, onRangeApply, onReset }: DealsTableViewProps) {
  const [rangeDrafts, setRangeDrafts] = useState<DealFilters>({})
  const [openRange, setOpenRange] = useState<RangeField | null>(null)
  const selectedRanges = { ...filters, ...rangeDrafts }

  return (
    <section aria-labelledby="table-title" className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 px-6 py-5">
        <h2 id="table-title" className="font-semibold">עסקאות בעמוד הנוכחי</h2>
        <span role="status" className="rounded-full bg-teal-50 dark:bg-teal-950 px-3 py-1 text-sm font-medium text-teal-800 dark:text-teal-300">{deals.length} מתוך {total} עסקאות</span>
      </div>
      <SearchBar value={query} onChange={onQueryChange} onReset={() => { setRangeDrafts({}); setOpenRange(null); onReset() }} />
      <p id="table-scroll-hint" className="border-b border-slate-100 dark:border-slate-800 px-6 py-3 text-xs text-slate-500 dark:text-slate-400">ניתן לגלול אופקית לצפייה בכל העמודות.</p>
      {/* Mirror the scroller vertically to place its native scrollbar at the top; mirror the table back to keep its contents upright. */}
      <div role="region" aria-label="טבלת עסקאות לגלילה אופקית" aria-describedby="table-scroll-hint" tabIndex={0} className="-scale-y-100 overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-600">
        <table aria-describedby="data-notice" className="-scale-y-100 w-full border-collapse whitespace-nowrap text-start text-sm">
          <caption className="sr-only">עסקאות נדל״ן — העמוד הנוכחי</caption>
          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <tr>
              {columns.map(([key, label]) => (
                <th key={key} scope="col" className="px-5 py-4 text-start font-semibold">
                  <span className="mb-2 block">{label}</span>
                  {key === 'size_sqm' || key === 'price_nis' || key === 'price_per_sqm' ? (
                    <RangeFilter label={label} min={selectedRanges[`${key}_min`] ?? ''} max={selectedRanges[`${key}_max`] ?? ''}
                      appliedMin={filters[`${key}_min`] ?? ''} appliedMax={filters[`${key}_max`] ?? ''}
                      open={openRange === key} invalid={hasInvalidRanges(selectedRanges)} onOpenChange={(open) => setOpenRange(open ? key : null)}
                      onChange={(min, max) => setRangeDrafts((current) => ({ ...current, [`${key}_min`]: min, [`${key}_max`]: max }))}
                      onCancel={() => setRangeDrafts((current) => ({ ...current, [`${key}_min`]: filters[`${key}_min`] ?? '', [`${key}_max`]: filters[`${key}_max`] ?? '' }))}
                      onApply={() => { onRangeApply(rangeDrafts); setRangeDrafts({}) }} />
                  ) : <ColumnFilter
                    type={key === 'deal_date' ? 'date' : numericFilterColumns.has(key) ? 'number' : 'select'}
                    label={label}
                    value={filters[key] ?? ''}
                    options={[...new Set([...deals.map((deal) => String(deal[key])), ...(filters[key] ? [filters[key]] : [])])]}
                    formatOption={(value) => formatValue(deals.find((deal) => String(deal[key]) === value)?.[key] ?? value, key)}
                    onChange={(value) => onFilterChange(key, value)}
                  />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {deals.map((deal) => (
              <tr key={`${deal.city}-${deal.street}-${deal.deal_date}`} className="transition-colors hover:bg-teal-50/50 dark:hover:bg-teal-950/50">
                {columns.map(([key, label]) => (
                  <DealCell key={key} field={key} label={label} value={deal[key]}
                    repaired={key !== 'row_status' && deal.fixed_fields.includes(key)} />
                ))}
              </tr>
            ))}
            {deals.length === 0 && (
              <tr><td colSpan={columns.length} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">לא נמצאו עסקאות התואמות לחיפוש ולמסננים.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
