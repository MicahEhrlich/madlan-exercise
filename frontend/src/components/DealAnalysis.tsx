import type { PropertyDeal } from '../types/propertyDeal'
import { useDealAnalysis } from '../hooks/useDealAnalysis'
import { canAnalyzeDeal } from '../utils/canAnalyzeDeal'
import DealAnalysisResults from './DealAnalysisResults'

export default function DealAnalysis({ deal }: { deal: PropertyDeal }) {
  const { data, loading, error, retry } = useDealAnalysis(deal)
  if (!canAnalyzeDeal(deal)) return <p className="text-sm text-slate-600 dark:text-slate-300">לא ניתן לנתח את העסקה ללא רחוב או שכונה ידועים.</p>
  if (loading) return <div role="status" className="flex items-center gap-3 py-4 text-teal-800 dark:text-teal-300">
    <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
    <span>מנתח עסקה</span>
  </div>
  const unavailable = data && 'status' in data
  if (error || unavailable) return <div role={error ? 'alert' : 'status'} className="text-sm text-slate-700 dark:text-slate-200">
    <p>{error || 'ניתוח העסקה אינו זמין כרגע.'}</p>
    <button type="button" onClick={retry} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">ניסיון נוסף לניתוח</button>
  </div>
  return data && !('status' in data) ? <DealAnalysisResults analysis={data} /> : null
}
