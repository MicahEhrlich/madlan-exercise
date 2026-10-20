import { useId } from 'react'
import { investmentPresets } from '../data/investmentPresets'
import type { InvestmentPresetId } from '../data/investmentPresets'
import type { DealFilters } from '../utils/filterDeals'
import { isInvestmentPresetActive } from '../utils/investmentPresets'

interface PresetFilterChipsProps {
  filters: DealFilters
  onToggle: (id: InvestmentPresetId) => void
}

export default function PresetFilterChips({ filters, onToggle }: PresetFilterChipsProps) {
  const descriptionId = useId()
  return <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
    <div role="group" aria-label="סינון מהיר למשקיעים" className="flex flex-wrap gap-2">
      {investmentPresets.map((preset) => <button key={preset.id} type="button"
        aria-pressed={isInvestmentPresetActive(filters, preset.id)} aria-describedby={preset.id === 'attractive' ? descriptionId : undefined}
        onClick={() => onToggle(preset.id)}
        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 aria-pressed:border-teal-700 aria-pressed:bg-teal-700 aria-pressed:text-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-teal-950 dark:aria-pressed:bg-teal-700 dark:aria-pressed:text-white">
        {preset.label}
      </button>)}
    </div>
    <p id={descriptionId} className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">האטרקטיביות מחושבת לפי מחיר למ״ר ביחס לעסקאות מאותו סוג נכס בעיר ובשכונה, עם לפחות 3 עסקאות אחרות בנתונים שנקלטו. ניתן לשלב מסננים וללחוץ שוב לביטול.</p>
  </div>
}
