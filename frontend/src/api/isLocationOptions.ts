import type { LocationOptions } from '../types/locationOptions'

export function isLocationOptions(value: unknown): value is LocationOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const options = value as Record<string, unknown>
  if ('selected_city' in options && options.selected_city !== null &&
    (typeof options.selected_city !== 'string' || !options.selected_city.trim())) return false
  if (!options.scope || typeof options.scope !== 'object') return false
  const scope = options.scope as Record<string, unknown>
  if (![scope.city, scope.neighborhood].every((name) => name === null || (typeof name === 'string' && name.trim().length > 0))) return false
  return ['cities', 'neighborhoods', 'streets'].every((key) => {
    const names = options[key]
    return Array.isArray(names) && names.every((name: unknown) => typeof name === 'string' && name.trim().length > 0) &&
      new Set(names).size === names.length
  })
}
