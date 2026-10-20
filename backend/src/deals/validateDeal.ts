import { dealHeaders } from './types.js'
import type { Deal, RawDeal, ValidationResult } from './types.js'

export function inspectDeal(raw: RawDeal) {
  const fields = Object.fromEntries(dealHeaders.map((key) => [key, raw[key].trim()])) as RawDeal
  const reasons: string[] = []

  for (const key of dealHeaders) {
    if (!fields[key]) reasons.push(`${key}: required value is missing`)
  }

  function number(key: keyof RawDeal, options: { price?: boolean; integer?: boolean; zero?: boolean } = {}) {
    let text = fields[key]
    if (options.price) text = text.replace(/^₪\s*/, '')
    if (key === 'rooms') text = text.replace(/\s+חדרים$/, '')
    // Accept only complete numbers, including correctly grouped thousands.
    const numeric = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)
    const value = numeric ? Number(text.replaceAll(',', '')) : Number.NaN
    if (!Number.isFinite(value) || (options.integer && !Number.isInteger(value)) ||
      (options.zero ? value < 0 : value <= 0)) {
      reasons.push(`${key}: expected a ${options.zero ? 'nonnegative' : 'positive'} ${options.integer ? 'integer' : 'number'}`)
    }
    return value
  }

  function boolean(key: keyof RawDeal) {
    const text = fields[key].toLowerCase()
    if (['כן', 'yes', 'true', '1'].includes(text)) return true
    if (['לא', 'no', 'false', '0'].includes(text)) return false
    reasons.push(`${key}: unrecognized boolean`)
    return false
  }

  function date() {
    const text = fields.deal_date
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
    const local = /^(\d{2})([/.])(\d{2})\2(\d{4})$/.exec(text)
    const normalized = iso ? text : local ? `${local[4]}-${local[3]}-${local[1]}` : ''
    const parsed = new Date(`${normalized}T00:00:00Z`)
    if (!normalized || normalized.startsWith('0000') || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
      reasons.push('deal_date: expected a valid exact date (YYYY-MM-DD, DD/MM/YYYY, or DD.MM.YYYY)')
    }
    return normalized
  }

  const deal: Deal = {
    deal_id: fields.deal_id,
    city: fields.city,
    neighborhood: fields.neighborhood,
    street: fields.street,
    property_type: fields.property_type,
    rooms: number('rooms'),
    size_sqm: number('size_sqm'),
    floor: fields.floor === 'unknown' ? 'unknown' : number('floor', { integer: true, zero: true }),
    total_floors: number('total_floors', { integer: true, zero: true }),
    year_built: fields.year_built === 'unknown' ? 'unknown' : number('year_built', { integer: true }),
    condition: fields.condition,
    has_elevator: boolean('has_elevator'),
    has_parking: boolean('has_parking'),
    has_balcony: boolean('has_balcony'),
    has_safe_room: boolean('has_safe_room'),
    deal_date: date(),
    price_nis: number('price_nis', { price: true }),
    price_per_sqm: number('price_per_sqm', { price: true }),
    source: fields.source,
  }

  if (typeof deal.floor === 'number' && deal.floor > deal.total_floors) reasons.push('floor: exceeds total_floors')
  if (deal.size_sqm > 0 && deal.price_nis > 0 && deal.price_per_sqm > 0 &&
    Math.abs(deal.price_nis / deal.size_sqm - deal.price_per_sqm) > 1) {
    reasons.push('price_per_sqm: differs from price_nis / size_sqm by more than 1 NIS/m²')
  }

  return { deal, reasons }
}

export function validateDeal(raw: RawDeal): ValidationResult {
  const { deal, reasons } = inspectDeal(raw)
  return reasons.length ? { reasons } : { deal, reasons: [] }
}
