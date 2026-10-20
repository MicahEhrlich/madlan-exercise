import type { FilterOptions } from '../types/filterOptions'

export function isFilterOptions(value: unknown): value is FilterOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const catalog = value as Record<string, unknown>
  const fields = ['property_type', 'condition', ...('source' in catalog ? ['source'] : [])]
  return fields.every((field) => {
    const names = catalog[field]
    return Array.isArray(names) && names.every((name: unknown) => typeof name === 'string' && name.trim().length > 0) &&
      new Set(names).size === names.length
  })
}
