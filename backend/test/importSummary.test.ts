import { rm } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadDealsWithSummary } from '../src/deals/loadDeals.js'
import { csv, fixture } from './fixtures.js'
import { proposed, report, response } from './repairFixtures.js'
import type { RepairRequest } from '../src/repairs/types.js'
import { needsLookup } from '../src/repairs/lookupEvidence.js'
import { fakeCache } from './cacheFixtures.js'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true }))) })
const logger = { info: vi.fn(), warn: vi.fn() }

it('reconciles the repository CSV counts without model access', async () => {
  expect((await loadDealsWithSummary(logger)).summary).toEqual({ total_rows: 530, parsed_rows: 503, completed_rows: 68 })
})

it('reports source records, accepted rows, and known completions independently of filtering, pagination, and Redis', async () => {
  const input = await fixture('\uFEFF' + csv([
    { street: 'הרצל\nקומה א' },
    { deal_id: 'D2', price_per_sqm: '', floor: '' },
    { deal_id: 'D3', year_built: '' },
    { deal_id: 'D4', rooms: '' },
    { street: 'הרצל\nקומה א' },
    { city: 'ירושלים' },
  ]) + '\n\nbad,fields\n')
  directories.push(input.directory)
  const { cache } = fakeCache()
  const app = buildApp({}, { csvPath: input.path, batchSize: 1, cache })
  try {
    expect(app.importSummary).toBeNull()
    await app.waitForDeals()
    const summary = await app.inject('/deals/summary')
    expect(summary.statusCode).toBe(200)
    expect(summary.json()).toEqual({ total_rows: 7, parsed_rows: 4, completed_rows: 1 })
    expect(app.deals).toHaveLength(4)
    expect(Object.isFrozen(app.importSummary)).toBe(true)
    expect(cache.get).not.toHaveBeenCalled()
    expect(cache.set).not.toHaveBeenCalled()
    expect((await app.inject('/deals?rooms=3&count=1&page=2')).json().rows).toHaveLength(1)
    expect((await app.inject('/deals/summary')).json()).toEqual(summary.json())
  } finally { await app.close() }
})

it('counts a mixed code/LLM completion once and does not double count deferred lookup passes or unknown-only repairs', async () => {
  const input = await fixture(csv([
    {},
    { deal_id: 'D2', has_parking: 'יש', price_per_sqm: '' },
    { deal_id: 'D3', year_built: '' },
    { deal_id: 'D4', condition: '', floor: '' },
  ]))
  directories.push(input.directory)
  const transport = vi.fn(async ({ candidates }: RepairRequest) => {
    if (candidates.some(needsLookup)) throw new Error('unavailable')
    return response(report(candidates.map((row) => proposed(row))))
  })
  const result = await loadDealsWithSummary(logger, input.path, { anthropicApiKey: 'test', repairTransport: transport, batchSize: 1 })
  expect(result.summary).toEqual({ total_rows: 4, parsed_rows: 4, completed_rows: 1 })
  expect(result.deals[1]!.fixed_fields).toEqual(['has_parking', 'price_per_sqm'])
  expect(result.deals[2]!.year_built).toBe('unknown')
  expect(transport).toHaveBeenCalledTimes(2)
})

it('reports zero completions for an original row and fails imports rather than publishing partial summaries', async () => {
  const input = await fixture(csv())
  directories.push(input.directory)
  expect((await loadDealsWithSummary(logger, input.path)).summary).toEqual({ total_rows: 1, parsed_rows: 1, completed_rows: 0 })
  const invalid = await fixture(csv() + '\n"unterminated')
  directories.push(invalid.directory)
  const app = buildApp({}, { csvPath: invalid.path, batchSize: 1 })
  try {
    await expect(app.waitForDeals()).rejects.toThrow('Could not read or parse deals CSV')
    expect(app.importSummary).toBeNull()
    expect(app.deals).toEqual([])
  } finally { await app.close() }
})
