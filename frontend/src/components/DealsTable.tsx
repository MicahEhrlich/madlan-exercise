import { useState } from 'react'
import { columns } from '../data/dealColumns'
import type { PropertyDeal } from '../types/propertyDeal'
import { filterDeals } from '../utils/filterDeals'
import type { DealFilters } from '../utils/filterDeals'
import { formatValue } from '../utils/formatValue'
import ColumnFilter from './ColumnFilter'
import SearchBar from './SearchBar'

interface DealsTableProps {
  deals: PropertyDeal[]
}

export default function DealsTable({ deals }: DealsTableProps) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<DealFilters>({})
  const filteredDeals = filterDeals(deals, query, filters)

  return (
    <section aria-labelledby="table-title" className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 px-6 py-5">
        <h2 id="table-title" className="font-semibold">עסקאות לדוגמה</h2>
        <span role="status" className="rounded-full bg-teal-50 dark:bg-teal-950 px-3 py-1 text-sm font-medium text-teal-800 dark:text-teal-300">{filteredDeals.length} מתוך {deals.length} עסקאות</span>
      </div>
      <SearchBar value={query} onChange={setQuery} onReset={() => { setQuery(''); setFilters({}) }} />
      <div role="region" aria-label="טבלת עסקאות לגלילה אופקית" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-600">
        <table aria-describedby="mock-notice" className="w-full border-collapse whitespace-nowrap text-start text-sm">
          <caption className="sr-only">עסקאות נדל״ן לדוגמה — נתוני דמה בלבד</caption>
          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <tr>
              {columns.map(([key, label]) => (
                <th key={key} scope="col" className="px-5 py-4 text-start font-semibold">
                  <span className="mb-2 block">{label}</span>
                  <ColumnFilter
                    label={label}
                    value={filters[key] ?? ''}
                    options={[...new Set(deals.map((deal) => String(deal[key])))]}
                    formatOption={(value) => formatValue(deals.find((deal) => String(deal[key]) === value)![key])}
                    onChange={(value) => setFilters((current) => ({ ...current, [key]: value }))}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredDeals.map((deal) => (
              <tr key={`${deal.city}-${deal.street}-${deal.deal_date}`} className="transition-colors hover:bg-teal-50/50 dark:hover:bg-teal-950/50">
                {columns.map(([key]) => (
                  <td key={key} className={`px-5 py-5 tabular-nums ${key === 'price_nis' ? 'font-semibold text-teal-800 dark:text-teal-300' : 'text-slate-700 dark:text-slate-200'}`}>
                    <bdi>{formatValue(deal[key])}</bdi>
                  </td>
                ))}
              </tr>
            ))}
            {filteredDeals.length === 0 && (
              <tr><td colSpan={columns.length} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">לא נמצאו עסקאות התואמות לחיפוש ולמסננים.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 dark:border-slate-800 px-6 py-3 text-xs text-slate-500 dark:text-slate-400">ניתן לגלול אופקית לצפייה בכל העמודות.</p>
    </section>
  )
}
