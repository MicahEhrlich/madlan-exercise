import DealsTable from './components/DealsTable'
import { mockDeals } from './data/mockDeals'

function App() {
  return (
    <main dir="rtl" lang="he" className="min-h-screen bg-slate-50 px-4 py-10 font-sans text-slate-900 sm:px-8">
      <div className="mx-auto max-w-screen-2xl">
        <header className="mb-8">
          <p className="mb-2 text-sm font-medium text-teal-700">סקירת עסקאות נדל״ן</p>
          <h1 className="text-3xl font-bold tracking-tight">טבלת עסקאות</h1>
          <p id="mock-notice" className="mt-3 text-sm leading-6 text-slate-600">
            נתוני דמה להמחשה בלבד — הרשומות אינן מייצגות עסקאות אמיתיות.
          </p>
        </header>

        <DealsTable deals={mockDeals} />
      </div>
    </main>
  )
}

export default App
