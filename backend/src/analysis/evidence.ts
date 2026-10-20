import type { SavedDeal } from '../deals/types.js'
import type { Comparisons } from './comparisons.js'
import { knownLocation } from './comparisons.js'

/** Only these factual statements may appear in the public explanation arrays. */
export function buildAnalysisEvidence(deal: Readonly<SavedDeal>, comparisons: Comparisons) {
  const strengths: string[] = []
  const { baseline, percentage } = comparisons
  const scopeLabel = { street: 'ברחוב', neighborhood: 'בשכונה', city: 'בעיר' }[baseline.scope]
  const price = `מחיר העסקה למ״ר ${percentage < 0 ? 'נמוך' : percentage > 0 ? 'גבוה' : 'אינו שונה'}${percentage === 0 ? '' : ` ב־${Math.abs(percentage)}%`} מממוצע ${baseline.count} עסקאות אחרות מאותו סוג נכס ${scopeLabel} בנתונים שנקלטו.`
  const risks = [
    'ההשוואה מבוססת על הנתונים שנקלטו בלבד ואינה קובעת את שווי השוק הנוכחי.',
    `עסקאות ההשוואה מתוארכות בין ${baseline.first_deal_date} ל־${baseline.last_deal_date}; לא בוצעה התאמה להבדלי זמן או למאפייני הנכסים.`,
  ]
  if (percentage <= 0) strengths.push(price)
  else risks.push(price)
  const amenities = { has_elevator: 'מעלית', has_parking: 'חניה', has_balcony: 'מרפסת', has_safe_room: 'ממ״ד' } as const
  for (const [field, label] of Object.entries(amenities) as [keyof typeof amenities, string][]) {
    if (deal[field]) strengths.push(`לפי הנתונים שנקלטו, בנכס יש ${label}.`)
    else risks.push(`לפי הנתונים שנקלטו, בנכס אין ${label}.`)
  }
  for (const [field, statement] of [
    ['year_built', 'שנת הבנייה אינה ידועה בנתונים שנקלטו.'],
    ['condition', 'מצב הנכס אינו ידוע בנתונים שנקלטו.'],
    ['floor', 'קומת הנכס אינה ידועה בנתונים שנקלטו.'],
  ] as const) {
    if (deal[field] === 'unknown') risks.push(statement)
  }
  if (!knownLocation(deal.street)) risks.push('הרחוב אינו ידוע ולכן לא נערכה השוואה ברמת הרחוב.')
  if (!knownLocation(deal.neighborhood)) risks.push('השכונה אינה ידועה ולכן לא נערכה השוואה ברמת השכונה.')
  if (deal.condition === 'לשיפוץ') risks.push('מצב הנכס מסומן בנתונים כזקוק לשיפוץ; היקף ועלות השיפוץ אינם ידועים.')
  if (deal.fixed_fields.length) risks.push('העסקה כוללת שדות שתוקנו או הושלמו בזמן קליטת הנתונים; אין בכך אימות חיצוני של פרטי הנכס.')
  return { strengths, risks }
}

export type AnalysisEvidence = ReturnType<typeof buildAnalysisEvidence>
