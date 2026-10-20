import { useImportSummary } from '../hooks/useImportSummary'
import { formatValue } from '../utils/formatValue'

export default function ImportSummary() {
  const { data, loading, processing, error, retry } = useImportSummary()
  return (
    <section aria-labelledby="import-summary-title" aria-busy={loading} className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      <h2 id="import-summary-title" className="mb-4 font-semibold">סיכום קליטת הנתונים</h2>
      {loading && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{processing ? 'הנתונים עדיין בעיבוד. נא להמתין…' : 'טוען סיכום קליטת נתונים…'}</p>}
      {error && <div role="alert" className="text-sm text-red-800 dark:text-red-200">
        <p>{error}</p>
        <button type="button" onClick={retry} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 dark:border-slate-600">טעינת הסיכום מחדש</button>
      </div>}
      {data && <>
        <dl className="grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-slate-600 dark:text-slate-300">רשומות שנקלטו בהצלחה מתוך כלל רשומות הקובץ</dt>
            <dd className="mt-2 text-2xl font-semibold tabular-nums">{formatValue(data.parsed_rows)} מתוך {formatValue(data.total_rows)}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600 dark:text-slate-300">רשומות שבהן הושלמו נתונים על ידי המערכת</dt>
            <dd className="mt-2 text-2xl font-semibold tabular-nums text-sky-800 dark:text-sky-300">{formatValue(data.completed_rows)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">הסיכום מתייחס לכל הקובץ ואינו משתנה לפי החיפוש והמסננים. רשומות שתוקנו לערכים לא ידועים בלבד אינן נספרות כהשלמה.</p>
      </>}
    </section>
  )
}
