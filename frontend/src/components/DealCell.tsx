import { useId, type ReactNode } from 'react'
import type { PropertyDealValues } from '../types/propertyDeal'
import { formatValue } from '../utils/formatValue'

interface DealCellProps {
  field: keyof PropertyDealValues
  label: string
  value: PropertyDealValues[keyof PropertyDealValues]
  repaired: boolean
  action?: ReactNode
}

export default function DealCell({ field, label, value, repaired, action }: DealCellProps) {
  const tooltipId = useId()
  const background = repaired
    ? value === 'unknown' ? 'bg-amber-100 dark:bg-amber-900/50' : 'bg-sky-100 dark:bg-sky-900/50'
    : ''
  return (
    <td className={`px-5 py-5 tabular-nums ${background} ${field === 'price_nis' ? 'font-semibold text-teal-800 dark:text-teal-300' : 'text-slate-700 dark:text-slate-200'}`}>
      {action}
      {repaired ? (
        <span tabIndex={0} aria-describedby={tooltipId} className="group relative inline-block cursor-help rounded focus-visible:outline-2 focus-visible:outline-amber-600">
          <bdi>{formatValue(value, field)}</bdi>
          <span id={tooltipId} role="tooltip" className="pointer-events-none invisible absolute bottom-full start-0 z-10 mb-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-normal text-white shadow-lg group-hover:visible group-focus:visible dark:bg-slate-100 dark:text-slate-900">
            {value === 'unknown' ? `${label}: לא ידוע` : `${label} הושלם על ידי המערכת`}
          </span>
        </span>
      ) : <bdi>{formatValue(value, field)}</bdi>}
    </td>
  )
}
