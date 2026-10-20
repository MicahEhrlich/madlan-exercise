// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockDeals } from '../data/mockDeals'
import { useState } from 'react'
import DealsTableView from './DealsTableView'
import { filterDeals } from '../utils/filterDeals'
import type { DealFilters } from '../utils/filterDeals'
import type { PropertyDeal } from '../types/propertyDeal'

// Exercise the controlled view with a parent that supplies filtered results.
function DealsTable({ deals }: { deals: PropertyDeal[] }) {
  const [filters, setFilters] = useState<DealFilters>({})
  const [query, setQuery] = useState('')
  return <DealsTableView deals={filterDeals(deals, query, filters)} total={deals.length} filters={filters} query={query}
    onQueryChange={setQuery} onFilterChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
    onRangeApply={(ranges) => setFilters((current) => ({ ...current, ...ranges }))}
    onReset={() => { setQuery(''); setFilters({}) }} />
}

afterEach(cleanup)

function displayedRows() {
  return within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('row')
}

describe('table search and filters', () => {
  it('dismisses floating filters with Escape, outside clicks, scrolling, resizing, and the trigger', () => {
    render(<DealsTable deals={mockDeals} />)
    const trigger = screen.getByRole('button', { name: 'סינון לפי שטח במ״ר' })
    fireEvent.click(trigger)
    fireEvent.pointerDown(screen.getByLabelText('שטח במ״ר — מקסימום'))
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('dialog')).toBeDefined()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(trigger)
    fireEvent.pointerDown(trigger)
    expect(screen.getByRole('dialog')).toBeDefined()
    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.scroll(window)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.resize(window)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('blocks applying other selections until an invalid pending range is corrected or canceled', () => {
    render(<DealsTable deals={mockDeals} />)
    fireEvent.click(screen.getByRole('button', { name: 'סינון לפי שטח במ״ר' }))
    fireEvent.change(screen.getByLabelText('שטח במ״ר — מינימום'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('שטח במ״ר — מקסימום'), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'סינון לפי מחיר בש״ח' }))
    expect((screen.getByRole('button', { name: 'החלה' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'סינון לפי שטח במ״ר' }))
    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }))
    fireEvent.click(screen.getByRole('button', { name: 'סינון לפי מחיר בש״ח' }))
    expect((screen.getByRole('button', { name: 'החלה' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it.each([
    ['חדרים', '3.5'],
    ['קומה', '0'],
    ['קומות בבניין', '3'],
    ['שנת בנייה', '1990'],
  ])('accepts a numeric %s filter with a placeholder and supports clearing it', (label, value) => {
    render(<DealsTable deals={mockDeals} />)
    const input = screen.getByRole('spinbutton', { name: `סינון לפי ${label}` }) as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe(label)
    fireEvent.change(input, { target: { value } })
    expect(input.validity.valid).toBe(true)
    expect(displayedRows()).toHaveLength(1)
    expect(displayedRows()[0]!.textContent).toContain('חיפה')
    fireEvent.click(screen.getByRole('button', { name: 'ניקוי חיפוש ומסננים' }))
    expect(input.value).toBe('')
    expect(displayedRows()).toHaveLength(4)
    fireEvent.change(input, { target: { value: '-1' } })
    expect(input.value).toBe('-1')
    expect(screen.getByText('לא נמצאו עסקאות התואמות לחיפוש ולמסננים.')).toBeDefined()
    fireEvent.change(input, { target: { value: '' } })
    expect(displayedRows()).toHaveLength(4)
  })

  it.each([
    ['שטח במ״ר', '80', '100'],
    ['מחיר בש״ח', '1800000', '3200000'],
    ['מחיר למ״ר', '16000', '32000'],
  ])('filters an inclusive %s range with either or both bounds and clears it', (label, lower, upper) => {
    render(<DealsTable deals={mockDeals} />)
    const trigger = screen.getByRole('button', { name: `סינון לפי ${label}` })
    const open = () => fireEvent.click(trigger)
    const min = () => screen.getByLabelText(`${label} — מינימום`) as HTMLInputElement
    const max = () => screen.getByLabelText(`${label} — מקסימום`) as HTMLInputElement
    const apply = () => fireEvent.click(screen.getByRole('button', { name: 'החלה' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    open()
    expect(screen.getByRole('dialog', { name: `טווח ${label}` }).parentElement).toBe(document.body)
    expect(min().value).toBe('')
    expect(max().value).toBe('')
    expect(document.activeElement).toBe(min())
    fireEvent.change(min(), { target: { value: lower } })
    fireEvent.change(max(), { target: { value: upper } })
    expect(displayedRows()).toHaveLength(4)
    apply()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(displayedRows()).toHaveLength(3)
    expect(trigger.textContent).toContain(lower)
    open()
    fireEvent.change(min(), { target: { value: upper } })
    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    open()
    expect(min().value).toBe(lower)
    fireEvent.change(min(), { target: { value: upper } })
    apply()
    expect(displayedRows()).toHaveLength(1)
    open()
    fireEvent.change(min(), { target: { value: `${Number(upper) + 0.5}` } })
    expect((screen.getByRole('button', { name: 'החלה' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(min(), { target: { value: '' } })
    apply()
    expect(displayedRows()).toHaveLength(3)
    open()
    fireEvent.change(max(), { target: { value: '' } })
    apply()
    expect(displayedRows()).toHaveLength(4)
    open()
    fireEvent.change(min(), { target: { value: upper } })
    apply()
    expect(displayedRows()).toHaveLength(2)
    open()
    fireEvent.change(min(), { target: { value: lower } })
    fireEvent.click(screen.getByRole('button', { name: 'ניקוי חיפוש ומסננים' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    open()
    expect(min().value).toBe('')
    expect(max().value).toBe('')
    expect(displayedRows()).toHaveLength(4)
    fireEvent.change(min(), { target: { value: '-1' } })
    expect((screen.getByRole('button', { name: 'החלה' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }))
    open()
    expect(min().value).toBe('')
    expect((screen.getByRole('button', { name: 'החלה' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('uses a date selector and supports selecting and clearing a deal date', () => {
    render(<DealsTable deals={mockDeals} />)
    const date = screen.getByLabelText('סינון לפי תאריך עסקה') as HTMLInputElement
    expect(date.type).toBe('date')
    expect(date.value).toBe('')
    fireEvent.change(date, { target: { value: '2026-03-05' } })
    expect(displayedRows()).toHaveLength(1)
    expect(displayedRows()[0]!.textContent).toContain('חיפה')
    fireEvent.change(date, { target: { value: '' } })
    expect(displayedRows()).toHaveLength(4)
  })

  it('highlights exactly the fields listed in each row and gives them Hebrew descriptions', () => {
    render(<DealsTable deals={mockDeals} />)
    const repairedRow = displayedRows()[2]!
    const cells = within(repairedRow).getAllByRole('cell')
    const highlighted = cells.filter((cell) => cell.classList.contains('bg-sky-100'))
    expect(highlighted).toHaveLength(2)
    expect(highlighted[0]!.textContent).toContain('טרומפלדור 18')
    expect(within(highlighted[0]!).getByRole('tooltip').textContent).toBe('רחוב הושלם על ידי המערכת')
    expect(within(highlighted[1]!).getByRole('tooltip').textContent).toBe('מחיר למ״ר הושלם על ידי המערכת')
    expect(within(displayedRows()[0]!).queryByRole('tooltip')).toBeNull()
    expect(within(repairedRow).getByText('הושלמו על ידי המערכת').closest('td')!.classList.contains('bg-sky-100')).toBe(false)
  })

  it('searches across columns and trims whitespace', () => {
    render(<DealsTable deals={mockDeals} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  ביאליק  ' } })
    expect(displayedRows()).toHaveLength(1)
    expect(displayedRows()[0]!.textContent).toContain('רמת גן')
    expect(screen.getByRole('status').textContent).toBe('1 מתוך 4 עסקאות')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '4,000,000' } })
    expect(displayedRows()[0]!.textContent).toContain('תל אביב–יפו')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '4000000' } })
    expect(displayedRows()[0]!.textContent).toContain('תל אביב–יפו')
  })

  it('combines search with multiple header filters and clears them together', () => {
    render(<DealsTable deals={mockDeals} />)
    expect(screen.getAllByRole('combobox')).toHaveLength(11)
    expect(screen.getAllByRole('spinbutton')).toHaveLength(4)
    fireEvent.change(screen.getByLabelText('סינון לפי מעלית'), { target: { value: 'true' } })
    expect(displayedRows()).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('סינון לפי עיר'), { target: { value: 'רמת גן' } })
    expect(displayedRows()).toHaveLength(1)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'חיפה' } })
    expect(screen.getByText('לא נמצאו עסקאות התואמות לחיפוש ולמסננים.')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'ניקוי חיפוש ומסננים' }))
    expect(displayedRows()).toHaveLength(4)
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('סינון לפי עיר') as HTMLSelectElement).value).toBe('')
  })

  it('filters false booleans, zero floors, dates, and prices and can clear a single filter', () => {
    render(<DealsTable deals={mockDeals} />)
    fireEvent.change(screen.getByLabelText('סינון לפי מרפסת'), { target: { value: 'false' } })
    fireEvent.change(screen.getByLabelText('סינון לפי קומה'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('סינון לפי תאריך עסקה'), { target: { value: '2026-03-05' } })
    fireEvent.click(screen.getByRole('button', { name: 'סינון לפי מחיר בש״ח' }))
    fireEvent.change(screen.getByLabelText('מחיר בש״ח — מינימום'), { target: { value: '1800000' } })
    fireEvent.click(within(screen.getByRole('dialog', { name: 'טווח מחיר בש״ח' })).getByRole('button', { name: 'החלה' }))
    expect(displayedRows()).toHaveLength(1)
    expect(displayedRows()[0]!.textContent).toContain('חיפה')
    fireEvent.change(screen.getByLabelText('סינון לפי קומה'), { target: { value: '' } })
    expect(displayedRows()).toHaveLength(1)
  })

  it('handles an empty dataset', () => {
    render(<DealsTable deals={[]} />)
    expect(screen.getByRole('status').textContent).toBe('0 מתוך 0 עסקאות')
    expect(screen.getByText('לא נמצאו עסקאות התואמות לחיפוש ולמסננים.')).toBeDefined()
  })

  it('displays Hebrew row statuses and combines status filtering with search', () => {
    render(<DealsTable deals={mockDeals} />)
    expect(within(displayedRows()[0]!).getByText('מקורית')).toBeDefined()
    expect(within(displayedRows()[2]!).getByText('הושלמו על ידי המערכת')).toBeDefined()
    const statusFilter = screen.getByLabelText('סינון לפי סטטוס רשומה')
    expect(within(statusFilter).getByRole('option', { name: 'מקורית' })).toBeDefined()
    expect(within(statusFilter).getByRole('option', { name: 'הושלמו על ידי המערכת' })).toBeDefined()
    fireEvent.change(statusFilter, { target: { value: 'fixed' } })
    expect(displayedRows()).toHaveLength(1)
    expect(displayedRows()[0]!.textContent).toContain('חיפה')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'מקורית' } })
    expect(screen.getByText('לא נמצאו עסקאות התואמות לחיפוש ולמסננים.')).toBeDefined()
    fireEvent.change(statusFilter, { target: { value: 'original' } })
    expect(displayedRows()).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'ניקוי חיפוש ומסננים' }))
    expect(displayedRows()).toHaveLength(4)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'הושלמו על ידי המערכת' } })
    expect(displayedRows()).toHaveLength(1)
  })
})
