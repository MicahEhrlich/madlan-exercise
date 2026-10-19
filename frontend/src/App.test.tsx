import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('property deals table', () => {
  it('renders all 18 column headers and four complete records', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html.match(/scope="col"/g)).toHaveLength(18)
    expect(html.match(/<td /g)).toHaveLength(4 * 18)
    for (const label of ['עיר', 'שכונה', 'רחוב', 'סוג נכס', 'חדרים', 'שטח במ״ר', 'קומה', 'קומות בבניין', 'שנת בנייה', 'מצב הנכס', 'מעלית', 'חניה', 'מרפסת', 'ממ״ד', 'תאריך עסקה', 'מחיר בש״ח', 'מחיר למ״ר', 'מקור']) {
      expect(html).toContain(`>${label}</span>`)
    }
    for (const city of ['תל אביב–יפו', 'רמת גן', 'חיפה', 'באר שבע']) {
      expect(html).toContain(city)
    }
  })

  it('identifies the data as fictional and provides an accessible RTL table', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('dir="rtl" lang="he"')
    expect(html).toContain('הרשומות אינן מייצגות עסקאות אמיתיות')
    expect(html).toContain('aria-describedby="mock-notice"')
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('<caption')
  })

  it('formats numbers and booleans while preserving dates and text', () => {
    const html = renderToStaticMarkup(<App />)
    for (const value of ['4,000,000', '50,000', '3.5', '0', 'כן', 'לא', '2026-01-15', 'נתוני דמה']) {
      expect(html).toContain(`<bdi>${value}</bdi>`)
    }
    expect(html).not.toContain('<bdi>true</bdi>')
    expect(html).not.toContain('<bdi>false</bdi>')
  })
})
