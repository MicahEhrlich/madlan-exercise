import { useTheme } from '../hooks/useTheme'
import type { Theme } from '../hooks/useTheme'

const modes: ReadonlyArray<readonly [Theme, string]> = [
  ['system', 'מערכת'],
  ['light', 'בהיר'],
  ['dark', 'כהה'],
]

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="mb-8 flex justify-end">
      <div role="group" aria-label="מצב תצוגה" className="inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        {modes.map(([mode, label]) => (
          <button key={mode} type="button" aria-pressed={theme === mode} onClick={() => setTheme(mode)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-600 aria-pressed:bg-teal-700 aria-pressed:text-white dark:text-slate-300 dark:hover:bg-slate-800 dark:aria-pressed:bg-teal-400 dark:aria-pressed:text-slate-950">
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
