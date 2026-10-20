import { columns } from '../data/dealColumns'
import type { PropertyDeal, PropertyDealValues } from '../types/propertyDeal'
import type { DealFilters } from '../utils/filterDeals'
import { formatValue } from '../utils/formatValue'
import ColumnFilter from './ColumnFilter'
import SearchBar from './SearchBar'
import DealCell from './DealCell'

interface DealsTableViewProps {
  deals: PropertyDeal[]
  total: number
  query: string
  filters: DealFilters
  onQueryChange: (value: string) => void
  onFilterChange: (key: keyof PropertyDealValues, value: string) => void
  onReset: () => void
}

export default function DealsTableView({ deals, total, query, filters, onQueryChange, onFilterChange, onReset }: DealsTableViewProps) {

  return (
    <section aria-labelledby="table-title" className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 px-6 py-5">
        <h2 id="table-title" className="font-semibold">עסקאות בעמוד הנוכחי</h2>
        <span role="status" className="rounded-full bg-teal-50 dark:bg-teal-950 px-3 py-1 text-sm font-medium text-teal-800 dark:text-teal-300">{deals.length} מתוך {total} עסקאות</span>
      </div>
      <SearchBar value={query} onChange={onQueryChange} onReset={onReset} />
      <div role="region" aria-label="טבלת עסקאות לגלילה אופקית" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-600">
        <table aria-describedby="data-notice" className="w-full border-collapse whitespace-nowrap text-start text-sm">
          <caption className="sr-only">עסקאות נדל״ן — העמוד הנוכחי</caption>
          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <tr>
              {columns.map(([key, label]) => (
                <th key={key} scope="col" className="px-5 py-4 text-start font-semibold">
                  <span className="mb-2 block">{label}</span>
                  <ColumnFilter
                    label={label}
                    value={filters[key] ?? ''}
                    options={[...new Set([...deals.map((deal) => String(deal[key])), ...(filters[key] ? [filters[key]] : [])])]}
                    formatOption={(value) => formatValue(deals.find((deal) => String(deal[key]) === value)?.[key] ?? value, key)}
                    onChange={(value) => onFilterChange(key, value)}
                  />
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
      <p className="border-t border-slate-100 dark:border-slate-800 px-6 py-3 text-xs text-slate-500 dark:text-slate-400">ניתן לגלול אופקית לצפייה בכל העמודות.</p>
    </section>
  )
}
