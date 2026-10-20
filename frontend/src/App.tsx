import ThemeToggle from './components/ThemeToggle'
import DealsTable from './components/DealsTable'

function App() {
  return (
    <main dir="rtl" lang="he" className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-10 font-sans text-slate-900 dark:text-slate-100 sm:px-8">
      <div className="mx-auto max-w-screen-2xl">
        <ThemeToggle />
        <header className="mb-8">
          <p className="mb-2 text-sm font-medium text-teal-700 dark:text-teal-400">סקירת עסקאות נדל״ן</p>
          <h1 className="text-3xl font-bold tracking-tight">טבלת עסקאות</h1>
          <p id="data-notice" className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            העסקאות נטענות מהשרת. החיפוש והמסננים חלים על כל העמודים. חלק מהשדות עשויים להיות ריקים, והמידע אינו מהווה ייעוץ או חוות דעת מקצועית.
          </p>
        </header>

        <DealsTable />
      </div>
    </main>
  )
}

export default App
