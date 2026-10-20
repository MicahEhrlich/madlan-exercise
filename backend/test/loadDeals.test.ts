import { readFile, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadDeals } from '../src/deals/loadDeals.js'
import { dealHeaders } from '../src/deals/types.js'
import { dealKey } from '../src/deals/dealKey.js'
import { csv, fixture } from './fixtures.js'

const directories: string[] = []
async function file(content: string) {
  const result = await fixture(content)
  directories.push(result.directory)
  return result.path
}
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true }))) })
const logger = () => ({ warn: vi.fn(), info: vi.fn() })

describe('CSV loader', () => {
  it('stores status for every accepted row without modifying source CSV or treating normalization as a repair', async () => {
    const content = csv([
      {},
      { deal_id: 'D2', price_per_sqm: '' },
      { deal_id: ' D3 ', city: ' חיפה ', has_parking: 'FALSE' },
      { deal_id: 'D4', floor: '', condition: '', has_parking: '' },
      { deal_id: 'D5', deal_date: 'Mar 2023' },
    ])
    const path = await file(content)
    const deals = await loadDeals(logger(), path, { batchSize: 1 })
    expect(deals.map((deal) => deal.row_status)).toEqual(['original', 'fixed', 'original', 'fixed', 'fixed'])
    expect(deals.map((deal) => deal.fixed_fields)).toEqual([
      [], ['price_per_sqm'], [], ['floor', 'condition', 'has_parking'], ['deal_date'],
    ])
    expect(await readFile(path, 'utf8')).toBe(content)
    expect(dealHeaders).not.toContain('row_status')
    expect(dealHeaders).not.toContain('fixed_fields')
    expect(deals.every(Object.isFrozen)).toBe(true)
    expect(deals.every((deal) => Object.isFrozen(deal.fixed_fields))).toBe(true)
  })

  it.each([undefined, 'test'])('loads MMM YYYY dates without a model request (API key: %s)', async (anthropicApiKey) => {
    const repairTransport = vi.fn()
    const log = logger()
    const deals = await loadDeals(log, await file(csv([{ deal_date: 'Mar 2023' }])), { anthropicApiKey, repairTransport })
    expect(deals[0]!.deal_date).toBe('2023-03-01')
    expect(repairTransport).not.toHaveBeenCalled()
    expect(log.warn).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ field: 'deal_date', original: 'Mar 2023', corrected: '2023-03-01', kind: 'default' }), 'CSV field corrected by code')
  })

  it('handles BOM, empty lines, quoted commas, escaped quotes, and embedded newlines', async () => {
    const path = await file('\uFEFF' + csv([{ street: 'רחוב, "הדר"\nקומה א' }]) + '\n\n')
    const log = logger()
    const deals = await loadDeals(log, path)
    expect(deals).toHaveLength(1)
    expect(deals[0]!.street).toBe('רחוב, "הדר"\nקומה א')
    expect(Object.isFrozen(deals)).toBe(true)
    expect(Object.isFrozen(deals[0])).toBe(true)
    expect(log.warn).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledWith({ total: 1, accepted: 1, rejected: 0 }, 'Deals CSV load complete')
  })

  it('keeps first valid ID; logs invalid rows and later duplicates with original data and reasons', async () => {
    const path = await file(csv([
      { deal_id: 'D1', rooms: '' },
      { deal_id: ' D1 ' },
      { deal_id: 'D1' },
      { deal_id: 'D2', has_parking: 'unknown', city: '' },
      { deal_id: 'D3' },
    ]))
    const log = logger()
    const deals = await loadDeals(log, path)
    expect(deals.map((deal) => deal.deal_id)).toEqual(['D1', 'D3'])
    expect(log.warn).toHaveBeenCalledTimes(3)
    expect(log.warn.mock.calls[0]![0]).toMatchObject({ recordNumber: 2, rawFields: expect.any(Array), reasons: expect.arrayContaining(['rooms: required value is missing']) })
    expect(log.warn.mock.calls[1]![0]).toMatchObject({ recordNumber: 4, reasons: ['deal_id: duplicate of an earlier valid deal at the same city and street'] })
    expect(log.warn.mock.calls[2]![0].reasons).toEqual(expect.arrayContaining(['city: required value is missing', 'has_parking: unrecognized boolean']))
    expect(log.info).toHaveBeenCalledWith({ total: 5, accepted: 2, rejected: 3 }, 'Deals CSV load complete')
  })

  it('skips rows with too few or too many fields, while loading subsequent valid records', async () => {
    const path = await file(csv() + '\ntoo,few\n' + Array(20).fill('extra').join(',') + '\n' + csv([{ deal_id: 'D2' }]).split('\n')[1])
    const log = logger()
    expect(await loadDeals(log, path)).toHaveLength(2)
    expect(log.warn).toHaveBeenCalledTimes(2)
    expect(log.warn.mock.calls[0]![0]).toMatchObject({ recordNumber: 3, rawFields: ['too', 'few'], reasons: ['Expected 19 fields, received 2'] })
  })

  it('supports reordered headers', async () => {
    expect(await loadDeals(logger(), await file(csv([{}], [...dealHeaders].reverse())))).toHaveLength(1)
  })

  it.each([
    '',
    csv([], dealHeaders.slice(1)),
    csv([], [...dealHeaders, 'city']),
    csv([], dealHeaders.map((header) => header === 'city' ? 'deal_id' : header)),
    csv([], dealHeaders.map((header) => header === 'city' ? 'unknown' : header)),
  ])('fails on missing, extra, duplicated, or incorrect headers', async (content) => {
    await expect(loadDeals(logger(), await file(content))).rejects.toThrow('Invalid deals CSV headers')
  })

  it('fails on unreadable files and irrecoverable CSV syntax', async () => {
    const path = await file(csv())
    await expect(loadDeals(logger(), path + '/missing.csv')).rejects.toThrow('Could not read or parse deals CSV')
    await expect(loadDeals(logger(), await file(csv() + '\n"unterminated'))).rejects.toThrow('Could not read or parse deals CSV')
  })

  it.each([csv([]), csv([{ city: '' }])])('fails when there are no valid deals and logs final counts', async (content) => {
    const log = logger()
    await expect(loadDeals(log, await file(content))).rejects.toThrow('Deals CSV contains no valid deals')
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ accepted: 0 }), 'Deals CSV load complete')
  })

  it('loads the repository CSV and reconciles the row counts', async () => {
    const log = logger()
    const deals = await loadDeals(log)
    expect(deals.length).toBeGreaterThan(0)
    expect(deals.length + log.warn.mock.calls.length).toBe(530)
    expect(new Set(deals.map(dealKey)).size).toBe(deals.length)
  })
})

describe('streamed in-memory batches', () => {
  it('saves each full batch and the final partial batch without changing order', async () => {
    const path = await file(csv(Array.from({ length: 5 }, (_, index) => ({ deal_id: `D${index}` }))))
    const log = logger()
    const deals = await loadDeals(log, path, { batchSize: 2 })
    expect(deals.map((deal) => deal.deal_id)).toEqual(['D0', 'D1', 'D2', 'D3', 'D4'])
    const batches = log.info.mock.calls.filter((call) => call[1] === 'Deals CSV batch saved').map((call) => call[0])
    expect(batches).toEqual([
      { batch: 1, processed: 2, accepted: 2, total: 2 },
      { batch: 2, processed: 2, accepted: 2, total: 4 },
      { batch: 3, processed: 1, accepted: 1, total: 5 },
    ])
    expect(Object.isFrozen(deals)).toBe(true)
    expect(deals.every(Object.isFrozen)).toBe(true)
  })

  it('preserves first-valid deduplication, rejection numbering, and empty accepted batches across boundaries', async () => {
    const path = await file(csv([
      { deal_id: 'D1', city: '' },
      { deal_id: 'D1' },
      { deal_id: ' D1 ' },
      { deal_id: 'D2' },
    ]))
    const log = logger()
    const deals = await loadDeals(log, path, { batchSize: 1 })
    expect(deals.map((deal) => deal.deal_id)).toEqual(['D1', 'D2'])
    expect(log.warn.mock.calls.map((call) => call[0].recordNumber)).toEqual([2, 4])
    expect(log.info).toHaveBeenCalledWith({ batch: 1, processed: 1, accepted: 0, total: 1 }, 'Deals CSV batch saved')
    expect(log.info).toHaveBeenCalledWith({ total: 4, accepted: 2, rejected: 2 }, 'Deals CSV load complete')
  })

  it('handles files larger than stream buffers using the default 1,000-row batch size', async () => {
    const path = await file(csv(Array.from({ length: 2505 }, (_, index) => ({ deal_id: `D${index}` }))))
    const log = logger()
    const deals = await loadDeals(log, path)
    expect(deals).toHaveLength(2505)
    expect(deals[2504]!.deal_id).toBe('D2504')
    const batches = log.info.mock.calls.filter((call) => call[1] === 'Deals CSV batch saved')
    expect(batches.map((call) => call[0].processed)).toEqual([1000, 1000, 505])
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('fails the import if malformed CSV appears after earlier batches were saved', async () => {
    const path = await file(csv(Array.from({ length: 2505 }, (_, index) => ({ deal_id: `D${index}` }))) + '\n"unterminated')
    const log = logger()
    await expect(loadDeals(log, path, { batchSize: 100 })).rejects.toThrow('Could not read or parse deals CSV')
    expect(log.info.mock.calls.some((call) => call[1] === 'Deals CSV batch saved')).toBe(true)
    expect(log.info.mock.calls.some((call) => call[1] === 'Deals CSV load complete')).toBe(false)
  })

  it('rejects invalid batch configuration before reading the CSV', async () => {
    await expect(loadDeals(logger(), 'unused.csv', { batchSize: 0 })).rejects.toThrow('CSV batch size must be a positive safe integer')
  })

  it('preserves the real dataset results when boundaries split valid and rejected rows', async () => {
    const log = logger()
    const deals = await loadDeals(log, undefined, { batchSize: 17 })
    expect(deals).toHaveLength(510)
    expect(log.warn).toHaveBeenCalledTimes(20)
    expect(log.info).toHaveBeenCalledWith({ total: 530, accepted: 510, rejected: 20 }, 'Deals CSV load complete')
  })
})

it('retains reused IDs at different cities or streets without changing row data or calling the LLM', async () => {
  const repairTransport = vi.fn()
  const log = logger()
  const path = await file(csv([
    {},
    { city: 'ירושלים' },
    { street: 'הנביאים' },
    {},
    { deal_id: 'D2' },
  ]))
  const deals = await loadDeals(log, path, { batchSize: 1, anthropicApiKey: 'test', repairTransport })
  expect(deals.map(({ deal_id, city, street }) => ({ deal_id, city, street }))).toEqual([
    { deal_id: 'D1', city: 'חיפה', street: 'הרצל' },
    { deal_id: 'D1', city: 'ירושלים', street: 'הרצל' },
    { deal_id: 'D1', city: 'חיפה', street: 'הנביאים' },
    { deal_id: 'D2', city: 'חיפה', street: 'הרצל' },
  ])
  expect(repairTransport).not.toHaveBeenCalled()
  expect(deals.map((deal) => deal.row_status)).toEqual(['original', 'original', 'original', 'original'])
  expect(deals.map((deal) => deal.fixed_fields)).toEqual([[], [], [], []])
  expect(log.info).toHaveBeenCalledWith({ originalAccepted: 2, codeCorrected: 2, llmCorrected: 0 }, 'Deals CSV correction summary')
  expect(log.info).toHaveBeenCalledWith({ total: 5, accepted: 4, rejected: 1 }, 'Deals CSV load complete')
  expect(log.info.mock.calls.filter((call) => call[1] === 'CSV ID collision retained by code')).toHaveLength(2)
  expect(log.warn.mock.calls[0]![0].recordNumber).toBe(5)
})

it('still rejects repeated ID/address combinations after trimming and validates different-address rows', async () => {
  const log = logger()
  const path = await file(csv([
    {},
    { deal_id: ' D1 ', city: ' חיפה ', street: ' הרצל ' },
    { street: 'הנביאים', floor: '99' },
    { street: 'הנביאים' },
  ]))
  const deals = await loadDeals(log, path, { batchSize: 1 })
  expect(deals.map((deal) => deal.street)).toEqual(['הרצל', 'הנביאים'])
  expect(log.warn.mock.calls.map((call) => call[0].recordNumber)).toEqual([3, 4])
  expect(log.warn.mock.calls[1]![0].reasons).toContain('floor: exceeds total_floors')
})

it('uses an unambiguous composite identity even when address values contain separators', async () => {
  const path = await file(csv([
    { city: 'a|b', street: 'c' },
    { city: 'a', street: 'b|c' },
  ]))
  expect(await loadDeals(logger(), path)).toHaveLength(2)
})
