interface ColumnFilterProps {
  type?: 'number' | 'date' | 'select'
  label: string
  value: string
  options: string[]
  formatOption: (value: string) => string
  onChange: (value: string) => void
  disabled?: boolean
  emptyOptionLabel?: string
}

export default function ColumnFilter({ type = 'select', label, value, options, formatOption, onChange, disabled = false, emptyOptionLabel = 'הכול' }: ColumnFilterProps) {
  const className = 'w-full min-w-28 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm font-normal text-slate-700 dark:text-slate-200 outline-teal-600'
  if (type !== 'select') {
    return <input type={type} step={type === 'number' ? 'any' : undefined} aria-label={`סינון לפי ${label}`} placeholder={label} value={value} onChange={(event) => onChange(event.target.value)} className={className} />
  }
  return (
    <select aria-label={`סינון לפי ${label}`} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className={`${className} disabled:opacity-50`}>
      <option value="">{emptyOptionLabel}</option>
      {options.map((option) => <option key={option} value={option}>{formatOption(option)}</option>)}
    </select>
  )
}
