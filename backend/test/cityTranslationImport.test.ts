import { readFile, rm } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { loadDealsWithSummary } from '../src/deals/loadDeals.js'
import { csv, fixture } from './fixtures.js'
import { proposed, report, response } from './repairFixtures.js'
import type { RepairRequest } from '../src/repairs/types.js'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true }))) })
async function file(rows: Parameters<typeof csv>[0]) {
  const input = await fixture(csv(rows))
  directories.push(input.directory)
  return input.path
}
const logger = () => ({ info: vi.fn(), warn: vi.fn() })

it('translates before deduplication and records city repairs without changing the CSV', async () => {
  const path = await file([{ city: ' Haifa ' }, {}, { deal_id: 'D2', city: 'HAIFA' }, { deal_id: 'D3', city: 'Unrecognizable' }])
  const original = await readFile(path, 'utf8')
  const transport = vi.fn(async ({ prompt }: { prompt: string }) => prompt.includes('Unrecognizable') ? 'UNKNOWN' : 'חיפה')
  const log = logger()
  const result = await loadDealsWithSummary(log, path, { anthropicApiKey: 'test', cityTranslationTransport: transport, batchSize: 1 })
  expect(result.deals.map((deal) => [deal.deal_id, deal.city, deal.fixed_fields])).toEqual([
    ['D1', 'חיפה', ['city']], ['D2', 'חיפה', ['city']],
  ])
  expect(result.deals.every((deal) => deal.row_status === 'fixed')).toBe(true)
  expect(result.summary).toEqual({ total_rows: 4, parsed_rows: 2, completed_rows: 2 })
  expect(log.info).toHaveBeenCalledWith({ originalAccepted: 0, codeCorrected: 0, llmCorrected: 2 }, 'Deals CSV correction summary')
  expect(transport).toHaveBeenCalledTimes(2)
  expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ recordNumber: 5, rawFields: expect.arrayContaining(['Unrecognizable']) }), 'Rejected CSV deal')
  expect(await readFile(path, 'utf8')).toBe(original)
})

it('retains city attribution through format repair and the second-pass lookup fallback', async () => {
  const path = await file([
    { city: 'Haifa', has_parking: 'יש' },
    { deal_id: 'D2', city: 'Haifa', year_built: '' },
  ])
  const translation = vi.fn(async () => 'חיפה')
  const repair = vi.fn(async ({ candidates }: RepairRequest) => {
    if (!candidates[0]!.prepared.year_built) throw new Error('offline')
    expect(candidates[0]!.prepared.city).toBe('חיפה')
    return response(report(candidates.map((row) => proposed(row))))
  })
  const result = await loadDealsWithSummary(logger(), path, { anthropicApiKey: 'test',
    cityTranslationTransport: translation, repairTransport: repair, batchSize: 1 })
  expect(result.deals.map((deal) => deal.fixed_fields)).toEqual([['city', 'has_parking'], ['city', 'year_built']])
  expect(result.deals[1]!.year_built).toBe('unknown')
  expect(result.summary).toEqual({ total_rows: 2, parsed_rows: 2, completed_rows: 2 })
  expect(translation).toHaveBeenCalledTimes(1)
  expect(repair).toHaveBeenCalledTimes(2)
})

it('excludes untranslatable rows while Hebrew rows remain available without a model', async () => {
  const result = await loadDealsWithSummary(logger(), await file([{}, { deal_id: 'D2', city: 'Haifa' }]))
  expect(result.deals).toHaveLength(1)
  expect(result.summary).toEqual({ total_rows: 2, parsed_rows: 1, completed_rows: 0 })
})

it('recovers the seven sample English city rows with mocked successful translations', async () => {
  const translation = vi.fn(async ({ prompt }: { prompt: string }) => prompt.includes('Jerusalem') ? 'ירושלים' : 'תל אביב-יפו')
  const result = await loadDealsWithSummary(logger(), undefined, { anthropicApiKey: 'test', cityTranslationTransport: translation,
    repairTransport: async () => { throw new Error('offline') } })
  expect(result.summary).toEqual({ total_rows: 530, parsed_rows: 510, completed_rows: 75 })
  expect(result.deals.filter((deal) => deal.fixed_fields.includes('city'))).toHaveLength(7)
  expect(result.deals.every((deal) => !/[a-z]/i.test(deal.city))).toBe(true)
  expect(translation).toHaveBeenCalledTimes(2)
})
