import { setImmediate } from 'node:timers/promises'
import type { FastifyBaseLogger } from 'fastify'
import { defaultBatchSize, readDealBatches } from './readDealBatches.js'
import type { Deal, DealCollection, RawDeal } from './types.js'
import { prepareDeal } from './prepareDeal.js'
import { dealKey } from './dealKey.js'
import { createRepairSession } from '../repairs/repairSession.js'
import type { RepairOptions } from '../repairs/repairSession.js'
import { dateRepairEvidence } from '../repairs/dateEvidence.js'
import { needsLookup } from '../repairs/lookupEvidence.js'
import { canAttemptRepair } from '../repairs/repairEvidence.js'

export const defaultCsvPath = new URL('../../../madlan_deals_sample (3) (2) (1) (1).csv', import.meta.url)

type LoadLogger = Pick<FastifyBaseLogger, 'warn' | 'info'>
export interface LoadDealsOptions extends RepairOptions {
  batchSize?: number
}

export async function loadDeals(logger: LoadLogger, csvPath: string | URL = defaultCsvPath, options: LoadDealsOptions = {}): Promise<DealCollection> {
  const entries: { recordNumber: number; deal: Readonly<Deal> }[] = []
  const seenIds = new Set<string>()
  const seenDeals = new Set<string>()
  // Keep identities, not raw rows: lookup candidates are streamed again only
  // after ordinary repairs finish; source lookups have their own bounded budget.
  const deferredLookupKeys = new Set<string>()
  let total = 0
  let rejected = 0
  let batchNumber = 0
  let originalAccepted = 0
  let codeCorrected = 0
  let llmCorrected = 0
  const reject = (recordNumber: number, rawFields: readonly string[], reasons: string[]) => {
    rejected++
    logger.warn({ recordNumber, rawFields, reasons }, 'Rejected CSV deal')
  }
  const save = (recordNumber: number, deal: Deal) => {
    const idCollision = seenIds.has(deal.deal_id)
    if (idCollision) {
      logger.info({ recordNumber, deal_id: deal.deal_id, city: deal.city, street: deal.street }, 'CSV ID collision retained by code')
    }
    seenIds.add(deal.deal_id)
    seenDeals.add(dealKey(deal))
    entries.push({ recordNumber, deal: Object.freeze(deal) })
    return idCollision
  }
  const repairs = createRepairSession(logger, options, (candidate, deal) => {
    // Pending identities are resolved before processing the same ID and address again.
    save(candidate.recordNumber, deal)
    llmCorrected++
    logger.info({ recordNumber: candidate.recordNumber, original: candidate.original, corrected: deal, dateDayDefaulted: dateRepairEvidence(candidate.original.deal_date)?.dayDefaulted ?? false }, 'CSV deal corrected by LLM')
  }, (candidate, reason) => reject(candidate.recordNumber, candidate.rawFields, [...candidate.reasons, reason]), (candidate, deal, reason) => {
    save(candidate.recordNumber, deal)
    codeCorrected++
    logger.info({ recordNumber: candidate.recordNumber, year_built: deal.year_built, neighborhood: deal.neighborhood, reason }, 'CSV deal retained with unknown lookup values')
  })

  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1 && !deferredLookupKeys.size) break
    for await (const { headers, records, firstRecordNumber } of readDealBatches(csvPath, options.batchSize ?? defaultBatchSize)) {
      const acceptedBefore = entries.length
      for (const [index, rawFields] of records.entries()) {
        if (pass === 0) total++
        const recordNumber = firstRecordNumber + index
        if (rawFields.length !== headers.length) {
          if (pass === 1) continue
          reject(recordNumber, rawFields, [`Expected ${headers.length} fields, received ${rawFields.length}`])
          continue
        }

        const raw = Object.fromEntries(headers.map((key, column) => [key, rawFields[column]])) as RawDeal
        const key = dealKey(raw)
        if (pass === 1 && !deferredLookupKeys.has(key)) continue
        if (pass === 0 && deferredLookupKeys.has(key)) continue
        const id = raw.deal_id.trim()
        if (repairs.hasPendingDeal(raw)) await repairs.flush()
        const prepared = prepareDeal(raw)
        const reasons = [...prepared.result.reasons]
        const duplicate = seenDeals.has(dealKey(raw))
        if (duplicate) reasons.push('deal_id: duplicate of an earlier valid deal at the same city and street')
        if (duplicate || !id) {
          reject(recordNumber, rawFields, reasons)
          continue
        }
        if (pass === 0 && options.anthropicApiKey && needsLookup({ prepared: prepared.raw }) && canAttemptRepair(prepared.raw, true)) {
          deferredLookupKeys.add(key)
          continue
        }
        for (const correction of prepared.corrections) {
          logger.info({ recordNumber, ...correction }, 'CSV field corrected by code')
        }
        if ('deal' in prepared.result) {
          const idCollision = save(recordNumber, prepared.result.deal)
          if (prepared.corrected || idCollision) codeCorrected++
          else originalAccepted++
        } else {
          await repairs.enqueue({ recordNumber, original: raw, prepared: prepared.raw, rawFields, reasons })
        }
      }

      if (pass === 0) {
        batchNumber++
        logger.info({ batch: batchNumber, processed: records.length, accepted: entries.length - acceptedBefore, total }, 'Deals CSV batch saved')
      }
      await setImmediate()
    }
    await repairs.flush()
  }

  logger.info({ originalAccepted, codeCorrected, llmCorrected }, 'Deals CSV correction summary')
  logger.info({ total, accepted: entries.length, rejected }, 'Deals CSV load complete')
  if (!entries.length) throw new Error('Deals CSV contains no valid deals')
  // Deferred repairs must not reorder the accepted CSV rows.
  entries.sort((a, b) => a.recordNumber - b.recordNumber)
  return Object.freeze(entries.map((entry) => entry.deal))
}
