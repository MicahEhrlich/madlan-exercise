import { setImmediate } from 'node:timers/promises'
import type { FastifyBaseLogger } from 'fastify'
import { defaultBatchSize, readDealBatches } from './readDealBatches.js'
import type { Deal, DealCollection, RawDeal } from './types.js'
import { validateDeal } from './validateDeal.js'

export const defaultCsvPath = new URL('../../../madlan_deals_sample (3) (2) (1) (1).csv', import.meta.url)

type LoadLogger = Pick<FastifyBaseLogger, 'warn' | 'info'>
export interface LoadDealsOptions {
  batchSize?: number
}

export async function loadDeals(logger: LoadLogger, csvPath: string | URL = defaultCsvPath, options: LoadDealsOptions = {}): Promise<DealCollection> {
  const deals: Readonly<Deal>[] = []
  const seenIds = new Set<string>()
  let total = 0
  let rejected = 0
  let batchNumber = 0

  for await (const { headers, records, firstRecordNumber } of readDealBatches(csvPath, options.batchSize ?? defaultBatchSize)) {
    const batch: Readonly<Deal>[] = []
    for (const [index, rawFields] of records.entries()) {
      total++
      const recordNumber = firstRecordNumber + index
      const reject = (reasons: string[]) => {
        rejected++
        logger.warn({ recordNumber, rawFields, reasons }, 'Rejected CSV deal')
      }
      if (rawFields.length !== headers.length) {
        reject([`Expected ${headers.length} fields, received ${rawFields.length}`])
        continue
      }

      const raw = Object.fromEntries(headers.map((key, column) => [key, rawFields[column]])) as RawDeal
      const result = validateDeal(raw)
      const reasons = [...result.reasons]
      if (seenIds.has(raw.deal_id.trim())) reasons.push('deal_id: duplicate of an earlier valid deal')
      if (reasons.length || !('deal' in result)) {
        reject(reasons)
        continue
      }
      seenIds.add(result.deal.deal_id)
      batch.push(Object.freeze(result.deal))
    }

    // Save this batch before asking the streaming reader for the next one.
    for (const deal of batch) deals.push(deal)
    batchNumber++
    logger.info({ batch: batchNumber, processed: records.length, accepted: batch.length, total }, 'Deals CSV batch saved')
    await setImmediate()
  }

  logger.info({ total, accepted: deals.length, rejected }, 'Deals CSV load complete')
  if (!deals.length) throw new Error('Deals CSV contains no valid deals')
  return Object.freeze(deals)
}
