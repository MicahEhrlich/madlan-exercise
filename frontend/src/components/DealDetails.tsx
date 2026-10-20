import type { PropertyDeal } from '../types/propertyDeal'
import { dealDetailFields } from '../data/dealDetailFields'
import { formatValue } from '../utils/formatValue'
import { isKnownLocation } from '../utils/canAnalyzeDeal'
import DealAnalysis from './DealAnalysis'

interface DealDetailsProps {
  deal: PropertyDeal
  id: string
  onClose: () => void
}

export default function DealDetails({ deal, id, onClose }: DealDetailsProps) {
  return <section id={id} aria-labelledby={`${id}-title`} dir="rtl" lang="he" className="sticky start-0 w-[100cqw] max-w-full whitespace-normal bg-slate-50 p-5 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-6">
    <div className="mb-5 flex items-center justify-between gap-4">
      <h3 id={`${id}-title`} className="font-semibold">פרטי העסקה</h3>
      <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-white dark:border-slate-600 dark:hover:bg-slate-900">סגירת פרטי העסקה</button>
    </div>
    <dl className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      {dealDetailFields.map(([field, label, unit]) => {
        const value = deal[field]
        const missing = value === undefined || value === null || (typeof value === 'string' && !isKnownLocation(value))
        return <div key={field} className="min-w-0">
          <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
          <dd className="mt-1 break-words font-medium"><bdi>{missing ? 'לא ידוע' : formatValue(value, field)}{!missing && unit ? ` ${unit}` : ''}</bdi></dd>
        </div>
      })}
    </dl>
    <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
      <h3 className="mb-3 font-semibold">ניתוח העסקה</h3>
      <DealAnalysis deal={deal} />
    </div>
  </section>
}
