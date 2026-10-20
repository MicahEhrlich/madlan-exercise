import { useId, useRef } from 'react'
import type { PropertyDeal } from '../types/propertyDeal'
import { columns } from '../data/dealColumns'
import DealCell from './DealCell'
import DealDetails from './DealDetails'

interface DealRowProps {
  deal: PropertyDeal
  expanded: boolean
  onToggle: () => void
  onClose: () => void
}

export default function DealRow({ deal, expanded, onToggle, onClose }: DealRowProps) {
  const detailsId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  return <>
    <tr onClick={onToggle} className={`cursor-pointer transition-colors hover:bg-teal-50/50 dark:hover:bg-teal-950/50 ${expanded ? 'bg-teal-50 dark:bg-teal-950/50' : ''}`}>
      {columns.map(([field, label]) => <DealCell key={field} field={field} label={label} value={deal[field]}
        repaired={field !== 'row_status' && deal.fixed_fields.includes(field)}
        action={field === 'row_status' ? <button ref={toggleRef} type="button" aria-expanded={expanded} aria-controls={expanded ? detailsId : undefined}
          aria-label={`${expanded ? 'סגירת' : 'פתיחת'} פרטי העסקה ${deal.row_id}`}
          onClick={(event) => { event.stopPropagation(); onToggle() }}
          className="me-3 inline-flex size-8 items-center justify-center rounded border border-slate-300 text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-slate-600 dark:text-teal-300">
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button> : undefined} />)}
    </tr>
    {expanded && <tr><td colSpan={columns.length} className="p-0">
      <DealDetails deal={deal} id={detailsId} onClose={() => { onClose(); toggleRef.current?.focus() }} />
    </td></tr>}
  </>
}
