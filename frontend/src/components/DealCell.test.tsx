// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import DealCell from './DealCell'
import { columns } from '../data/dealColumns'
import { mockDeals } from '../data/mockDeals'

afterEach(cleanup)

it('uses each Hebrew column label for hover and keyboard descriptions', () => {
  render(<table><tbody><tr>{columns.filter(([key]) => key !== 'row_status').map(([key, label]) =>
    <DealCell key={key} field={key} label={label} value={mockDeals[0]![key]} repaired />,
  )}</tr></tbody></table>)
  for (const [, label] of columns.filter(([key]) => key !== 'row_status')) {
    const tooltip = screen.getByText(`${label} הושלם על ידי המערכת`)
    const value = tooltip.parentElement!
    expect(value.getAttribute('aria-describedby')).toBe(tooltip.id)
    value.focus()
    expect(document.activeElement).toBe(value)
    expect(tooltip.classList.contains('group-hover:visible')).toBe(true)
    expect(tooltip.classList.contains('group-focus:visible')).toBe(true)
    expect(value.closest('td')!.classList.contains('bg-sky-100')).toBe(true)
    expect(value.closest('td')!.classList.contains('dark:bg-sky-900/50')).toBe(true)
  }
})

it('keeps zero, false, and unknown repaired values visible and formatted', () => {
  render(<table><tbody><tr>
    <DealCell field="floor" label="קומה" value={0} repaired />
    <DealCell field="has_parking" label="חניה" value={false} repaired />
    <DealCell field="year_built" label="שנת בנייה" value="unknown" repaired />
  </tr></tbody></table>)
  for (const value of ['0', 'לא']) {
    expect(screen.getByText(value, { selector: 'bdi' }).closest('td')!.classList.contains('bg-sky-100')).toBe(true)
  }
  expect(screen.getByText('לא ידוע', { selector: 'bdi' }).closest('td')!.classList.contains('bg-amber-100')).toBe(true)
  expect(screen.getByText('קומה הושלם על ידי המערכת')).toBeDefined()
  expect(screen.getByText('חניה הושלם על ידי המערכת')).toBeDefined()
  expect(screen.queryByText('שנת בנייה הושלם על ידי המערכת')).toBeNull()
  expect(screen.getByText('שנת בנייה: לא ידוע')).toBeDefined()
})

it.each([
  ['floor', 'קומה'],
  ['year_built', 'שנת בנייה'],
  ['condition', 'מצב הנכס'],
  ['neighborhood', 'שכונה'],
] as const)('describes unknown %s values without claiming completion', (field, label) => {
  render(<table><tbody><tr><DealCell field={field} label={label} value="unknown" repaired /></tr></tbody></table>)
  const tooltip = screen.getByRole('tooltip')
  expect(tooltip.textContent).toBe(`${label}: לא ידוע`)
  expect(tooltip.textContent).not.toContain('הושלם')
  expect(tooltip.closest('td')!.classList.contains('bg-amber-100')).toBe(true)
  expect(tooltip.closest('td')!.classList.contains('dark:bg-amber-900/50')).toBe(true)
  expect(tooltip.closest('td')!.classList.contains('bg-sky-100')).toBe(false)
  expect(screen.getByText('לא ידוע', { selector: 'bdi' })).toBeDefined()
  const target = tooltip.parentElement!
  target.focus()
  expect(document.activeElement).toBe(target)
  expect(target.getAttribute('aria-describedby')).toBe(tooltip.id)
})

it('keeps original cells free of repair backgrounds and tooltip focus targets', () => {
  render(<table><tbody><tr><DealCell field="street" label="רחוב" value="הרצל" repaired={false} /></tr></tbody></table>)
  expect(screen.getByRole('cell').classList.contains('bg-amber-100')).toBe(false)
  expect(screen.getByRole('cell').classList.contains('bg-sky-100')).toBe(false)
  expect(screen.queryByRole('tooltip')).toBeNull()
  expect(screen.getByText('הרצל').parentElement!.hasAttribute('tabindex')).toBe(false)
})
