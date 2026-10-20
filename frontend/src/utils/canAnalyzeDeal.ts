import type { PropertyDeal } from '../types/propertyDeal'

export function isKnownLocation(value: string | undefined): boolean {
  const text = value?.trim()
  return Boolean(text && text.toLowerCase() !== 'unknown')
}

export function canAnalyzeDeal(deal: Pick<PropertyDeal, 'street' | 'neighborhood'>): boolean {
  return isKnownLocation(deal.street) || isKnownLocation(deal.neighborhood)
}
