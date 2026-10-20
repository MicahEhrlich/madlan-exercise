import { z } from 'zod'

export const rowIdSchema = z.string().regex(/^row-[1-9]\d*$/).refine((value) => {
  const recordNumber = Number(value.slice(4))
  return Number.isSafeInteger(recordNumber) && recordNumber >= 2
})
