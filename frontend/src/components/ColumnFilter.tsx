interface ColumnFilterProps {
  label: string
  value: string
  options: string[]
  formatOption: (value: string) => string
  onChange: (value: string) => void
}

export default function ColumnFilter({ label, value, options, formatOption, onChange }: ColumnFilterProps) {
  return (
    <select aria-label={`סינון לפי ${label}`} value={value} onChange={(event) => onChange(event.target.value)} className="w-full min-w-28 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-700 outline-teal-600">
      <option value="">הכול</option>
      {options.map((option) => <option key={option} value={option}>{formatOption(option)}</option>)}
    </select>
  )
}
