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
    onReset={() => { setQuery(''); setFilters({}) }} />
}

afterEach(cleanup)

function displayedRows() {
  return within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('row')
}

describe('table search and filters', () => {
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
    expect(screen.getAllByRole('combobox')).toHaveLength(19)
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
    fireEvent.change(screen.getByLabelText('סינון לפי מחיר בש״ח'), { target: { value: '1800000' } })
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
