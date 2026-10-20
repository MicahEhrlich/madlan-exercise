import { useEffect, useState } from 'react'
import { useDeals } from '../hooks/useDeals'
import DealsTableView from './DealsTableView'
import type { DealFilters } from '../utils/filterDeals'
import type { PropertyDealValues } from '../types/propertyDeal'

export default function DealsTable() {
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(20)
  const [filters, setFilters] = useState<DealFilters>({})
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  useEffect(() => {
    if (query === appliedQuery) return
    const timeout = setTimeout(() => {
      setAppliedQuery(query)
      setPage(1)
    }, 500)
    return () => clearTimeout(timeout)
  }, [query, appliedQuery])
  const { data, loading, processing, error, retry } = useDeals(page, count, filters, appliedQuery)
  const changeFilter = (key: keyof PropertyDealValues, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }
  const buttonClass = 'rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-slate-600'

  return (
    <div aria-busy={loading} className="space-y-4">
      {loading && <p role="status">{processing ? 'הנתונים עדיין בעיבוד. נא להמתין…' : 'טוען עסקאות…'}</p>}
      {error && <div role="alert" className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
        <p>{error}</p>
        <button type="button" onClick={retry} className={buttonClass}>ניסיון נוסף</button>
      </div>}
      {!error && data && <>
        <DealsTableView deals={data.rows} total={data.total} filters={filters} query={query}
          onQueryChange={setQuery} onFilterChange={changeFilter}
          onReset={() => { setFilters({}); setQuery(''); setAppliedQuery(''); setPage(1) }} />
        <nav aria-label="דפדוף בעסקאות" className="flex flex-wrap items-center gap-4">
          <button type="button" className={buttonClass} disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>העמוד הקודם</button>
          <span>{data.total_pages > 0 && <>עמוד {data.page} מתוך {data.total_pages} · </>}{data.total} עסקאות</span>
          <button type="button" className={buttonClass} disabled={loading || page >= data.total_pages} onClick={() => setPage((value) => value + 1)}>העמוד הבא</button>
          <label>עסקאות בעמוד <select aria-label="עסקאות בעמוד" value={count} className="rounded border bg-white p-2 dark:bg-slate-900" onChange={(event) => { setCount(Number(event.target.value)); setPage(1) }}>
            {[20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select></label>
        </nav>
      </>}
    </div>
  )
}
