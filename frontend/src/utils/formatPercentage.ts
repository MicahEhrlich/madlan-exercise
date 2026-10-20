const percentageFormatter = new Intl.NumberFormat('he-IL', {
  style: 'percent',
  maximumFractionDigits: 1,
})

/** An empty population has no defined percentage. */
export function formatPercentage(count: number, total: number): string {
  return total === 0 ? '—' : percentageFormatter.format(count / total)
}
