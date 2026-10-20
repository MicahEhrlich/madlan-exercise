import type { DealAnalysis } from '../types/dealAnalysis'
import { formatValue } from '../utils/formatValue'

const assessmentLabels = {
  Undervalued: 'מתחת לטווח ההשוואה',
  'Fairly Priced': 'בטווח ההשוואה',
  Overpriced: 'מעל לטווח ההשוואה',
}

export default function DealAnalysisResults({ analysis }: { analysis: DealAnalysis }) {
  const percentage = analysis.estimated_discount_premium_pct
  return <div className="space-y-4">
    <p className="font-semibold text-teal-800 dark:text-teal-300">{assessmentLabels[analysis.valuation_assessment]}</p>
    <p className="text-sm">{percentage === 0 ? 'ללא הנחה או פרמיה' : <>{percentage < 0 ? 'הנחה' : 'פרמיה'} של <bdi className="font-semibold tabular-nums">{formatValue(Math.abs(percentage))}%</bdi></>} ביחס לממוצע המחיר למ״ר בעסקאות ההשוואה בנתונים.</p>
    <div className="grid gap-5 sm:grid-cols-2">
      <section aria-label="נקודות חוזקה">
        <h4 className="mb-2 font-semibold">נקודות חוזקה</h4>
        {analysis.key_strengths.length ? <ul className="list-inside list-disc space-y-2 text-sm">{analysis.key_strengths.map((statement) => <li key={statement}>{statement}</li>)}</ul> : <p className="text-sm text-slate-500 dark:text-slate-400">לא צוינו נקודות חוזקה.</p>}
      </section>
      <section aria-label="גורמי סיכון">
        <h4 className="mb-2 font-semibold">גורמי סיכון</h4>
        <ul className="list-inside list-disc space-y-2 text-sm">{analysis.risk_factors.map((statement) => <li key={statement}>{statement}</li>)}</ul>
      </section>
    </div>
  </div>
}
