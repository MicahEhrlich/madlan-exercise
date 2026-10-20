import { z } from 'zod'
import { dealHeaders } from '../deals/types.js'

export const dealSchema = z.strictObject({
  deal_id: z.string(), city: z.string(), neighborhood: z.string(), street: z.string(), property_type: z.string(),
  rooms: z.number(), size_sqm: z.number(), floor: z.union([z.number(), z.literal('unknown')]), total_floors: z.number(), year_built: z.number(),
  condition: z.string(), has_elevator: z.boolean(), has_parking: z.boolean(), has_balcony: z.boolean(),
  has_safe_room: z.boolean(), deal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), price_nis: z.number(), price_per_sqm: z.number(), source: z.string(),
})
export const rawDealSchema = z.strictObject(Object.fromEntries(dealHeaders.map((key) => [key, z.string()])))
export const repairReportSchema = z.strictObject({
  auto_corrected: z.number().int().nonnegative(),
  rows_failed_to_correct: z.number().int().nonnegative(),
  auto_corrected_rows: z.array(dealSchema),
  failed_rows: z.array(rawDealSchema),
})
