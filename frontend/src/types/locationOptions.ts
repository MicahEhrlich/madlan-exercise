export interface LocationOptions {
  selected_city?: string | null
  scope: { city: string | null; neighborhood: string | null }
  cities: string[]
  neighborhoods: string[]
  streets: string[]
}
