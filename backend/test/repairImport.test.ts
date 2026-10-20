import { rm } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { loadDeals } from '../src/deals/loadDeals.js'
import { buildApp } from '../src/app.js'
import { csv, fixture } from './fixtures.js'
import { proposed, report, response } from './repairFixtures.js'
import type { RepairRequest } from '../src/repairs/types.js'
import { needsLookup } from '../src/repairs/lookupEvidence.js'
import { dateRepairEvidence } from '../src/repairs/dateEvidence.js'

const directories: string[] = []
async function file(content: string) {
  const result = await fixture(content)
  directories.push(result.directory)
  return result.path
}
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true }))) })
const logger = () => ({ info: vi.fn(), warn: vi.fn() })
const succeed = async ({ candidates }: RepairRequest) => response(report(candidates.map((row) => proposed(row))))

it.each(['disabled', 'failed', 'invalid', 'unsupported', 'unknown'] as const)('retains missing lookup facts safely when the model is %s', async (mode) => {
  const transport = vi.fn(async ({ candidates }: RepairRequest) => {
    if (mode === 'failed') throw new Error('unavailable')
    if (mode === 'invalid') return response('not json')
    return response(report(candidates.map((row) => proposed(row, {
      has_parking: false,
      year_built: mode === 'unknown' ? 'unknown' : 1990,
      neighborhood: mode === 'unknown' ? 'unknown' : 'unverified neighborhood',
    }))))
  })
  const log = logger()
  const deals = await loadDeals(log, await file(csv([{ year_built: '', neighborhood: '', floor: '', price_per_sqm: '' }])), {
    anthropicApiKey: mode === 'disabled' ? undefined : 'test', repairTransport: transport,
  })
  expect(deals).toHaveLength(1)
  expect(deals[0]).toMatchObject({ row_status: 'fixed', year_built: 'unknown', neighborhood: 'unknown', city: 'חיפה', has_parking: false })
  expect(deals[0]!.fixed_fields).toEqual(['neighborhood', 'floor', 'year_built', 'price_per_sqm'])
  expect(transport).toHaveBeenCalledTimes(mode === 'disabled' ? 0 : 1)
  expect(log.info).toHaveBeenCalledWith({ total: 1, accepted: 1, rejected: 0 }, 'Deals CSV load complete')
})

it('combines code and verified LLM field repairs without marking unchanged values', async () => {
  const transport = vi.fn(async ({ candidates }: RepairRequest) => response(report(candidates.map((row) => proposed(row, {
    has_parking: false, deal_date: '2025-08-01',
  })))))
  const path = await file(csv([{ has_parking: 'אין', floor: '', price_per_sqm: '', deal_date: '2025-08' }]))
  const app = buildApp({}, { csvPath: path, anthropicApiKey: 'test', repairTransport: transport })
  try {
    const result = await app.inject('/deals?row_status=fixed&count=1')
    expect(result.statusCode).toBe(200)
    const row = result.json().rows[0]
    expect(row).toMatchObject({ row_status: 'fixed', floor: 'unknown', has_parking: false, price_per_sqm: 20000, deal_date: '2025-08-01' })
    expect(row.fixed_fields).toEqual(['floor', 'has_parking', 'deal_date', 'price_per_sqm'])
    expect(app.deals[0]!.fixed_fields).toEqual(row.fixed_fields)
    expect(Object.isFrozen(app.deals[0]!.fixed_fields)).toBe(true)
    expect(transport).toHaveBeenCalledTimes(1)
    expect(Object.keys(transport.mock.calls[0]![0].candidates[0]!.original)).toHaveLength(19)
  } finally { await app.close() }
})

it('does not call the model for code-repaired prices or valid data', async () => {
  const transport = vi.fn(succeed)
  const log = logger()
  const path = await file(csv([{ price_per_sqm: '' }, { deal_id: 'D2' }, { deal_id: 'D3', price_per_sqm: '999' }]))
  const deals = await loadDeals(log, path, { anthropicApiKey: 'test', repairTransport: transport, batchSize: 1 })
  expect(deals).toHaveLength(3)
  expect(deals.every((row) => row.price_per_sqm === 20000)).toBe(true)
  expect(transport).not.toHaveBeenCalled()
  expect(log.info).toHaveBeenCalledWith({ originalAccepted: 1, codeCorrected: 2, llmCorrected: 0 }, 'Deals CSV correction summary')
})

it('accumulates repair rows across parsing batches, flushes at EOF, and preserves original row order', async () => {
  const transport = vi.fn(succeed)
  const path = await file(csv([
    { deal_id: 'D1', has_parking: 'יש' },
    { deal_id: 'D2' },
    { deal_id: 'D3', has_parking: 'יש' },
    { deal_id: 'D4' },
    { deal_id: 'D5', price_per_sqm: '' },
    { deal_id: 'D6', has_parking: 'יש' },
  ]))
  const log = logger()
  const deals = await loadDeals(log, path, { anthropicApiKey: 'test', repairTransport: transport, batchSize: 1, llmBatchSize: 2 })
  expect(transport.mock.calls.map(([request]) => request.candidates.map((row) => row.original.deal_id))).toEqual([['D1', 'D3'], ['D6']])
  expect(deals.map((row) => row.deal_id)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6'])
  expect(deals.map((row) => row.row_status)).toEqual(['fixed', 'original', 'fixed', 'original', 'fixed', 'fixed'])
  expect(deals.map((row) => row.fixed_fields)).toEqual([['has_parking'], [], ['has_parking'], [], ['price_per_sqm'], ['has_parking']])
  expect(Object.isFrozen(deals)).toBe(true)
  expect(deals.every(Object.isFrozen)).toBe(true)
  expect(log.info).toHaveBeenCalledWith({ originalAccepted: 2, codeCorrected: 1, llmCorrected: 3 }, 'Deals CSV correction summary')
  expect(log.info).toHaveBeenCalledWith({ total: 6, accepted: 6, rejected: 0 }, 'Deals CSV load complete')
  expect(log.warn).not.toHaveBeenCalled()
})

it('resolves earlier pending IDs before accepting later duplicates and never sends structural errors or missing IDs', async () => {
  const transport = vi.fn(succeed)
  const log = logger()
  const path = await file(csv([
    { has_parking: 'יש' }, { has_parking: 'no' },
    { deal_id: '' },
  ]) + '\nbad,fields')
  const deals = await loadDeals(log, path, { anthropicApiKey: 'test', repairTransport: transport })
  expect(deals).toHaveLength(1)
  expect(deals[0]!.has_parking).toBe(true)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(log.info).toHaveBeenCalledWith({ total: 4, accepted: 1, rejected: 3 }, 'Deals CSV load complete')
  expect(log.warn.mock.calls.map((call) => call[0].recordNumber)).toEqual([3, 4, 5])
})

it('keeps valid and code-corrected rows when the API is unavailable and never retries', async () => {
  const transport = vi.fn(async () => { throw new Error('unavailable') })
  const log = logger()
  const path = await file(csv([
    {}, { deal_id: 'D2', price_per_sqm: 'wrong' },
    { deal_id: 'D3', has_parking: 'יש' }, { deal_id: 'D4', has_parking: 'יש' },
  ]))
  expect(await loadDeals(log, path, { anthropicApiKey: 'test', repairTransport: transport, llmBatchSize: 1 })).toHaveLength(2)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(log.info).toHaveBeenCalledWith({ total: 4, accepted: 2, rejected: 2 }, 'Deals CSV load complete')
})

it('does not reserve IDs for unrepairable rows and fails startup only when no acceptable deals remain', async () => {
  const transport = vi.fn(async ({ candidates }: RepairRequest) => response(report([], candidates.map((row) => row.original))))
  const path = await file(csv([{ year_built: '', rooms: '' }, {}]))
  expect(await loadDeals(logger(), path, { anthropicApiKey: 'test', repairTransport: transport })).toHaveLength(1)
  const invalidPath = await file(csv([{ year_built: '', rooms: '' }]))
  await expect(loadDeals(logger(), invalidPath, { anthropicApiKey: 'test', repairTransport: transport })).rejects.toThrow('no valid deals')
})

it('publishes repaired deals before serving the unchanged health endpoint', async () => {
  const path = await file(csv([{ has_parking: 'יש' }]))
  const app = buildApp({}, { csvPath: path, anthropicApiKey: 'test', repairTransport: succeed })
  try {
    expect(app.deals).toHaveLength(0)
    const result = await app.inject('/health')
    expect(result.statusCode).toBe(200)
    expect(result.json()).toEqual({ status: 'ok' })
    expect(app.deals[0]!.has_parking).toBe(true)
    expect((await app.inject('/deals')).json().rows).toEqual(app.deals)
  } finally { await app.close() }
})

it('matches repairs sharing an ID by their addresses, including out-of-order model results', async () => {
  const transport = vi.fn(async ({ candidates }: RepairRequest) => response(report(candidates.map((row) => proposed(row)).reverse())))
  const path = await file(csv([
    { has_parking: 'יש' },
    { has_parking: 'אין', street: 'הנביאים' },
    {},
  ]))
  // The second proposal must preserve its own false amenity evidence.
  transport.mockImplementation(async ({ candidates }) => response(report(candidates.map((row) => proposed(row, {
    has_parking: row.original.has_parking === 'יש',
  })).reverse())))
  const log = logger()
  const deals = await loadDeals(log, path, { batchSize: 1, llmBatchSize: 2, anthropicApiKey: 'test', repairTransport: transport })
  expect(transport).toHaveBeenCalledTimes(1)
  expect(transport.mock.calls[0]![0].candidates).toHaveLength(2)
  expect(deals.map(({ deal_id, street, has_parking }) => ({ deal_id, street, has_parking }))).toEqual([
    { deal_id: 'D1', street: 'הרצל', has_parking: true },
    { deal_id: 'D1', street: 'הנביאים', has_parking: false },
  ])
  expect(log.info).toHaveBeenCalledWith({ total: 3, accepted: 2, rejected: 1 }, 'Deals CSV load complete')
})

it('repairs reciprocal financial values and missing-value defaults entirely in code', async () => {
  const transport = vi.fn(succeed)
  const log = logger()
  const path = await file(csv([
    { condition: '', floor: '', has_parking: '' },
    { deal_id: 'D2', price_nis: '' },
    { deal_id: 'D3', size_sqm: '' },
    { deal_id: 'D4', price_per_sqm: '' },
  ]))
  const deals = await loadDeals(log, path, { batchSize: 1, anthropicApiKey: 'test', repairTransport: transport })
  expect(transport).not.toHaveBeenCalled()
  expect(deals).toHaveLength(4)
  expect(deals[0]).toMatchObject({ floor: 'unknown', condition: 'unknown', has_parking: false })
  expect(deals[1]!.price_nis).toBe(2000000)
  expect(deals[2]!.size_sqm).toBe(100)
  expect(deals[3]!.price_per_sqm).toBe(20000)
  expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ field: 'has_parking', kind: 'default', original: '', corrected: 'false' }), 'CSV field corrected by code')
  expect(log.info).toHaveBeenCalledWith({ originalAccepted: 0, codeCorrected: 4, llmCorrected: 0 }, 'Deals CSV correction summary')
})

it('normalizes abbreviated month dates in code and sends remaining eligible dates to the LLM', async () => {
  const path = await file(csv([
    { deal_id: 'date1', deal_date: 'Aug 2025' },
    { deal_id: 'bad-size', deal_date: 'Aug 2025', size_sqm: '', price_per_sqm: '' },
    { deal_id: 'bad-year', deal_date: 'Aug 2025', year_built: '', rooms: '' },
    { deal_id: 'date2', deal_date: '2025-09' },
    { deal_id: 'bad-location', deal_date: 'Aug 2025', neighborhood: '', size_sqm: '', price_per_sqm: '' },
    { deal_id: 'date3', deal_date: 'August 15, 2025' },
    { deal_id: 'impossible', deal_date: '2025-02-31' },
    { deal_id: 'valid' },
  ]))
  const dates: Record<string, string> = { date1: '2025-08-01', date2: '2025-09-01', date3: '2025-08-15' }
  const transport = vi.fn(async ({ candidates }: RepairRequest) => response(report(candidates.map((row) => proposed(row, {
    has_parking: false, deal_date: dates[row.original.deal_id]!,
  })))))
  const log = logger()
  const deals = await loadDeals(log, path, { batchSize: 1, llmBatchSize: 2, anthropicApiKey: 'test', repairTransport: transport })
  expect(transport.mock.calls.map(([request]) => request.candidates.map((row) => row.original.deal_id))).toEqual([['date2', 'date3']])
  expect(transport.mock.calls.every(([request]) => request.candidates.every((row) => Object.keys(row.original).length === 19))).toBe(true)
  expect(deals.map((row) => [row.deal_id, row.deal_date])).toEqual([
    ['date1', '2025-08-01'], ['date2', '2025-09-01'], ['date3', '2025-08-15'], ['valid', '2024-02-29'],
  ])
  expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ recordNumber: 2, field: 'deal_date', original: 'Aug 2025', corrected: '2025-08-01', kind: 'default' }), 'CSV field corrected by code')
  expect(log.info).toHaveBeenCalledWith({ total: 8, accepted: 4, rejected: 4 }, 'Deals CSV load complete')
})

it('makes zero API calls when every rejected row has an unrepairable error', async () => {
  const path = await file(csv([
    {},
    { deal_id: 'D2', deal_date: 'Aug 2025', size_sqm: '', price_per_sqm: '' },
    { deal_id: 'D3', year_built: '', rooms: '' },
    { deal_id: 'D4', neighborhood: '', rooms: '' },
  ]))
  const transport = vi.fn(succeed)
  expect(await loadDeals(logger(), path, { anthropicApiKey: 'test', repairTransport: transport })).toHaveLength(1)
  expect(transport).not.toHaveBeenCalled()
})

it('attempts eligible fact lookups with full context, retains unknown years, and skips other unrepairable errors', async () => {
  const path = await file(csv([
    {},
    { deal_id: 'unknown-year', year_built: '', has_safe_room: 'yes' },
    { deal_id: 'neighborhood', neighborhood: '' },
    { deal_id: 'unrepairable', year_built: '', size_sqm: '', price_per_sqm: '' },
  ]))
  const transport = vi.fn(async ({ candidates }: RepairRequest) => {
    const corrected = candidates.filter((row) => row.original.deal_id === 'neighborhood')
    const failed = candidates.filter((row) => row.original.deal_id !== 'neighborhood')
    return {
      ...response(report(corrected.map((row) => proposed(row, { has_parking: false, neighborhood: 'הדר' })), failed.map((row) => row.original))),
      facts: corrected.map((row) => ({
        identity: JSON.stringify([row.original.deal_id, row.original.city, row.original.street]),
        field: 'neighborhood' as const, value: 'הדר', url: 'https://city.example/streets',
        quote: 'בחיפה ברחוב הרצל כל הרחוב נמצא בשכונת הדר.',
      })),
    }
  })
  const log = logger()
  const deals = await loadDeals(log, path, { batchSize: 1, anthropicApiKey: 'test', repairTransport: transport, llmBatchSize: 2 })
  expect(transport.mock.calls.flatMap(([request]) => request.candidates.map((row) => row.original.deal_id))).toEqual(['unknown-year', 'neighborhood'])
  const profile = transport.mock.calls[0]![0].candidates[0]!.prepared
  expect(profile).toMatchObject({ total_floors: '4', size_sqm: '100', rooms: '3', has_elevator: 'כן', has_parking: 'no', has_balcony: '1', has_safe_room: 'yes' })
  expect(deals.map((row) => row.deal_id)).toEqual(['D1', 'unknown-year', 'neighborhood'])
  expect(deals[1]!.year_built).toBe('unknown')
  expect(deals.map((row) => row.row_status)).toEqual(['original', 'fixed', 'fixed'])
  expect(deals.map((row) => row.fixed_fields)).toEqual([[], ['year_built'], ['neighborhood']])
  expect(log.info).toHaveBeenCalledWith({ total: 4, accepted: 3, rejected: 1 }, 'Deals CSV load complete')
  expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ lookupSources: [expect.objectContaining({ field: 'neighborhood', url: 'https://city.example/streets' })] }), 'CSV repair batch complete')
})

it('finishes date repairs before a failing lookup, without mixing request types or retaining raw lookup rows', async () => {
  const path = await file(csv([
    { deal_id: 'year', year_built: '' },
    { deal_id: 'date1', deal_date: 'Aug 2025' },
    { deal_id: 'neighborhood', neighborhood: '' },
    { deal_id: 'date2', deal_date: '2025-09' },
    {},
  ]) + '\nbad,fields')
  const transport = vi.fn(async ({ candidates }: RepairRequest) => {
    expect(candidates.every((row) => needsLookup(row) === needsLookup(candidates[0]!))).toBe(true)
    if (candidates.some(needsLookup)) throw new Error('search unavailable')
    return response(report(candidates.map((row) => proposed(row, {
      has_parking: false, deal_date: dateRepairEvidence(row.original.deal_date)!.date,
    }))))
  })
  const log = logger()
  const deals = await loadDeals(log, path, { anthropicApiKey: 'test', repairTransport: transport, batchSize: 1, llmBatchSize: 2 })
  expect(transport.mock.calls.map(([request]) => request.candidates.map((row) => row.original.deal_id))).toEqual([
    ['date2'], ['year', 'neighborhood'],
  ])
  expect(deals.map((row) => row.deal_id)).toEqual(['year', 'date1', 'neighborhood', 'date2', 'D1'])
  expect(deals[0]!.year_built).toBe('unknown')
  expect(deals[2]!.neighborhood).toBe('unknown')
  expect(log.info).toHaveBeenCalledWith({ total: 6, accepted: 5, rejected: 1 }, 'Deals CSV load complete')
  expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ repairKind: 'lookup', timedOut: false }), 'CSV repair service unavailable; continuing import')
})

it.each([true, false])('preserves first-valid identity behavior across deferred lookups (lookup succeeds: %s)', async (success) => {
  const path = await file(csv([{ year_built: '' }, { year_built: '2005' }]))
  const transport = vi.fn(async ({ candidates }: RepairRequest) => ({
    ...response(success ? report(candidates.map((row) => proposed(row, { has_parking: false, year_built: 1990 })))
      : report([], candidates.map((row) => row.original))),
    facts: success ? candidates.map((row) => ({ identity: JSON.stringify([row.original.deal_id, row.original.city, row.original.street]),
      field: 'year_built' as const, value: 1990, url: 'https://city.example', quote: 'All buildings built in 1990' })) : [],
  }))
  const log = logger()
  const deals = await loadDeals(log, path, { anthropicApiKey: 'test', repairTransport: transport })
  expect(deals).toHaveLength(1)
  expect(deals[0]!.year_built).toBe(success ? 1990 : 'unknown')
  expect(log.info).toHaveBeenCalledWith({ total: 2, accepted: 1, rejected: 1 }, 'Deals CSV load complete')
})

it('recovers all abbreviated month dates in code even when the lookup service fails', async () => {
  const transport = vi.fn(async ({ candidates }: RepairRequest) => {
    expect(candidates.every(needsLookup)).toBe(true)
    throw new Error('lookup failed')
  })
  const log = logger()
  const deals = await loadDeals(log, undefined, { anthropicApiKey: 'test', repairTransport: transport, batchSize: 17 })
  expect(deals).toHaveLength(510)
  expect(log.info).toHaveBeenCalledWith({ originalAccepted: 381, codeCorrected: 129, llmCorrected: 0 }, 'Deals CSV correction summary')
  expect(log.info).toHaveBeenCalledWith({ total: 530, accepted: 510, rejected: 20 }, 'Deals CSV load complete')
})

it('gives deferred lookups their own budget after priority repairs', async () => {
  const path = await file(csv([
    { deal_id: 'year1', year_built: '' },
    ...['date1', 'date2', 'date3'].map((deal_id) => ({ deal_id, deal_date: '2025-08' })),
    { deal_id: 'year2', year_built: '' },
  ]))
  let elapsed = 0
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
  const transport = vi.fn(async ({ candidates }: RepairRequest) => {
    elapsed += candidates.some(needsLookup) ? 3000 : 9000
    return response(report(candidates.map((row) => proposed(row, { has_parking: false, deal_date: '2025-08-01' }))))
  })
  try {
    const log = logger()
    const deals = await loadDeals(log, path, { anthropicApiKey: 'test', repairTransport: transport, llmBatchSize: 1 })
    expect(deals.map((row) => row.deal_id)).toEqual(['year1', 'date1', 'date2', 'date3', 'year2'])
    expect(transport).toHaveBeenCalledTimes(5)
    expect(transport.mock.calls[3]![0].signal.aborted).toBe(false)
    expect(elapsed).toBe(33000)
    expect(log.info).toHaveBeenCalledWith({ total: 5, accepted: 5, rejected: 0 }, 'Deals CSV load complete')
  } finally { clock.mockRestore() }
})
