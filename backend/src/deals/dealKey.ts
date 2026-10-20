import type { Deal } from './types.js'

/** IDs can be reused across addresses. JSON encoding avoids delimiter collisions. */
export function dealKey(deal: Pick<Deal, 'deal_id' | 'city' | 'street'>): string {
  return JSON.stringify([deal.deal_id.trim(), deal.city.trim(), deal.street.trim()])
}
