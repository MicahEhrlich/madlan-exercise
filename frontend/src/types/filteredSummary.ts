export interface FilteredSummary {
  average_price_per_sqm: number | null
  city_comparison: {
    city: string
    average_price_per_sqm: number
    difference_pct: number
  } | null
}
