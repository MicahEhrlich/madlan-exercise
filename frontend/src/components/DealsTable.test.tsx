// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockDeals } from '../data/mockDeals'
import DealsTable from './DealsTable'

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
    expect(screen.getAllByRole('combobox')).toHaveLength(18)
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
})
