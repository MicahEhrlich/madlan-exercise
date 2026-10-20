import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'
import DealsTableView from './components/DealsTableView'
import { mockDeals } from './data/mockDeals'

const table = <DealsTableView deals={mockDeals} total={mockDeals.length} query="" filters={{}}
  onQueryChange={() => {}} onFilterChange={() => {}} onReset={() => {}} />

describe('property deals table', () => {
  it('renders all 19 column headers and four complete records', () => {
    const html = renderToStaticMarkup(table)
    expect(html.match(/scope="col"/g)).toHaveLength(19)
    expect(html.match(/<td /g)).toHaveLength(4 * 19)
    for (const label of ['סטטוס רשומה', 'עיר', 'שכונה', 'רחוב', 'סוג נכס', 'חדרים', 'שטח במ״ר', 'קומה', 'קומות בבניין', 'שנת בנייה', 'מצב הנכס', 'מעלית', 'חניה', 'מרפסת', 'ממ״ד', 'תאריך עסקה', 'מחיר בש״ח', 'מחיר למ״ר', 'מקור']) {
      expect(html).toContain(`>${label}</span>`)
    }
    for (const city of ['תל אביב–יפו', 'רמת גן', 'חיפה', 'באר שבע']) {
      expect(html).toContain(city)
    }
  })

  it('describes server data and provides an accessible RTL page and table', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('dir="rtl" lang="he"')
    expect(html).toContain('העסקאות נטענות מהשרת')
    expect(html).toContain('טוען עסקאות')
    const tableHtml = renderToStaticMarkup(table)
    expect(tableHtml).toContain('aria-describedby="data-notice"')
    expect(tableHtml).toContain('role="region"')
    expect(tableHtml).toContain('tabindex="0"')
    expect(tableHtml).toContain('<caption')
  })

  it('formats numbers and booleans while preserving dates and text', () => {
    const html = renderToStaticMarkup(table)
    for (const value of ['4,000,000', '50,000', '3.5', '0', 'כן', 'לא', '2026-01-15', 'נתוני דמה']) {
      expect(html).toContain(`<bdi>${value}</bdi>`)
    }
    expect(html).not.toContain('<bdi>true</bdi>')
    expect(html).not.toContain('<bdi>false</bdi>')
  })
})
