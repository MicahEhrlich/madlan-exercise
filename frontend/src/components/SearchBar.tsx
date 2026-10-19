interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onReset: () => void
}

export default function SearchBar({ value, onChange, onReset }: SearchBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-6 py-4">
      <label className="min-w-48 flex-1 text-sm font-medium text-slate-700">
        חיפוש בכל העמודות
        <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder="חיפוש עיר, רחוב או כל ערך אחר…" className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal outline-teal-600" />
      </label>
      <button type="button" onClick={onReset} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-teal-600">ניקוי חיפוש ומסננים</button>
    </div>
  )
}
