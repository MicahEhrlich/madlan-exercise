import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface RangeFilterProps {
  label: string
  min: string
  max: string
  appliedMin: string
  appliedMax: string
  open: boolean
  invalid: boolean
  onOpenChange: (open: boolean) => void
  onChange: (min: string, max: string) => void
  onApply: () => void
  onCancel: () => void
}

export default function RangeFilter({ label, min, max, appliedMin, appliedMax, open, invalid, onOpenChange, onChange, onApply, onCancel }: RangeFilterProps) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const dismiss = useEffectEvent(() => onOpenChange(false))
  useEffect(() => {
    if (!open) return
    panel.current?.querySelector('input')?.focus()
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) dismiss()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { dismiss(); trigger.current?.focus() }
    }
    const close = () => dismiss()
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])
  const finish = (action: () => void) => { action(); onOpenChange(false); trigger.current?.focus() }
  const className = 'w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-700 outline-teal-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
  return (
    <>
      <button ref={trigger} type="button" aria-label={`סינון לפי ${label}`} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined}
        className="w-full min-w-28 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-start text-sm font-normal text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        onClick={() => {
          const rect = trigger.current!.getBoundingClientRect()
          setPosition({ top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 230)), left: Math.max(8, Math.min(rect.right - 272, window.innerWidth - 280)) })
          onOpenChange(!open)
        }}>
        {appliedMin || appliedMax ? `${appliedMin || 'ללא מינימום'} – ${appliedMax || 'ללא מקסימום'}` : 'סינון טווח'}
      </button>
      {open && createPortal(
        <div ref={panel} id={id} role="dialog" aria-label={`טווח ${label}`} dir="rtl" lang="he" style={position}
          className="fixed z-50 w-68 max-w-[calc(100vw-1rem)] space-y-3 rounded-lg border border-slate-300 bg-white p-3 text-slate-700 shadow-xl dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
          <p className="text-sm font-medium">{label}</p>
          <div className="flex gap-2">
            <input type="number" step="any" min="0" aria-label={`${label} — מינימום`} placeholder="מינימום" value={min} onChange={(event) => onChange(event.target.value, max)} className={className} />
            <input type="number" step="any" min="0" aria-label={`${label} — מקסימום`} placeholder="מקסימום" value={max} onChange={(event) => onChange(min, event.target.value)} className={className} />
          </div>
          {invalid && <p className="text-xs text-red-700 dark:text-red-300">יש לתקן את הטווחים שנבחרו: ערכים חיוביים או אפס, ומינימום שאינו גדול מהמקסימום.</p>}
          <div className="flex gap-2">
            <button type="button" disabled={invalid} onClick={() => finish(onApply)} className="rounded-md bg-teal-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-40">החלה</button>
            <button type="button" onClick={() => finish(onCancel)} className="rounded-md border border-slate-300 px-3 py-1 text-xs dark:border-slate-600">ביטול</button>
          </div>
        </div>, document.body,
      )}
    </>
  )
}
