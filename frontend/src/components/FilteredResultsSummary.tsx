import type { FilteredSummary } from '../types/filteredSummary'
import { formatValue } from '../utils/formatValue'

const priceFormatter = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 })

interface FilteredResultsSummaryProps {
  total: number
  summary?: FilteredSummary
  loading: boolean
}

export default function FilteredResultsSummary({ total, summary, loading }: FilteredResultsSummaryProps) {
  const comparison = summary?.city_comparison
  return <p role="status" aria-label="סיכום תוצאות מסוננות" aria-atomic="true"
    className="border-b border-slate-100 bg-teal-50/60 px-6 py-3 text-sm leading-6 text-teal-950 dark:border-slate-800 dark:bg-teal-950/30 dark:text-teal-100">
    {loading ? 'מעדכן סיכום תוצאות…' : <>
      מוצגות <bdi className="font-semibold tabular-nums">{formatValue(total)}</bdi> עסקאות
      <span aria-hidden="true"> | </span>
      מחיר ממוצע למ״ר בסינון זה: {summary?.average_price_per_sqm != null
        ? <bdi className="font-semibold tabular-nums">{priceFormatter.format(summary.average_price_per_sqm)} ₪</bdi>
        : total === 0 ? 'אין נתונים לחישוב ממוצע' : 'לא זמין'}
      {comparison ? <span> ({comparison.difference_pct === 0 ? 'כממוצע העירוני' : <>{comparison.difference_pct < 0 ? 'נמוך' : 'גבוה'} ב־<bdi>{formatValue(Math.abs(comparison.difference_pct))}%</bdi> מהממוצע העירוני</>} ב{comparison.city})</span>
        : summary?.average_price_per_sqm != null && <span> (הסינון כולל כמה ערים)</span>}
    </>}
  </p>
}
