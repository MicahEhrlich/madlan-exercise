import { readFile, rm } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { csv, fixture } from './fixtures.js'
import { successfulAnalysis } from './analysisFixtures.js'
import { proposed, report, response } from './repairFixtures.js'
import type { RepairRequest } from '../src/repairs/types.js'
import { fakeCache } from './cacheFixtures.js'

const apps: ReturnType<typeof buildApp>[] = []
const directories: string[] = []
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })))
})
async function setup(options: Parameters<typeof buildApp>[1] = {}, content = csv([
  { price_per_sqm: 'wrong', price_nis: '1760000' },
  { deal_id: 'peer1', price_nis: '2000000' },
  { deal_id: 'peer2', price_nis: '2000000' },
  { deal_id: 'peer3', price_nis: '2000000' },
  { deal_id: 'excluded', rooms: '' },
])) {
  const input = await fixture(content)
  directories.push(input.directory)
  const app = buildApp({}, { csvPath: input.path, ...options })
  apps.push(app)
  await app.waitForDeals()
  return { app, path: input.path }
}

it('analyzes repaired saved values and returns exactly the requested four fields', async () => {
  const transport = vi.fn(successfulAnalysis)
  const { app, path } = await setup({ anthropicApiKey: 'test', analysisTransport: transport })
  const original = await readFile(path, 'utf8')
  const listing = (await app.inject('/deals')).json()
  expect(listing.rows.map((row: { row_id: string }) => row.row_id)).toEqual(['row-2', 'row-3', 'row-4', 'row-5'])
  const result = await app.inject(`/deals/${listing.rows[0].row_id}/analysis`)
  expect(result.statusCode).toBe(200)
  expect(result.headers['cache-control']).toBe('no-store')
  expect(result.json()).toEqual({ valuation_assessment: 'Undervalued', estimated_discount_premium_pct: -12,
    key_strengths: expect.any(Array), risk_factors: expect.any(Array) })
  const request = transport.mock.calls[0]![0]
  expect(request.deal.price_per_sqm).toBe(17600)
  expect(request.deal.fixed_fields).toEqual(['price_per_sqm'])
  expect(request.comparisons.baseline.count).toBe(3)
  expect(request.deal).toEqual(app.deals[0])
  expect(await readFile(path, 'utf8')).toBe(original)
  expect((await app.inject('/deals/summary')).statusCode).toBe(200)
  expect((await app.inject('/health')).json()).toEqual({ status: 'ok' })
})

it.each(['invalid', 'row-0', 'row-1', 'row-02', 'row-2.5', 'row-9007199254740992'])('rejects malformed row ID %s without calling the model', async (id) => {
  const transport = vi.fn(successfulAnalysis)
  const { app } = await setup({ anthropicApiKey: 'test', analysisTransport: transport })
  expect((await app.inject(`/deals/${id}/analysis`)).statusCode).toBe(400)
  expect(transport).not.toHaveBeenCalled()
})

it.each(['row-6', 'row-999'])('returns 404 for excluded or unknown row %s', async (id) => {
  const transport = vi.fn(successfulAnalysis)
  const { app } = await setup({ anthropicApiKey: 'test', analysisTransport: transport })
  expect((await app.inject(`/deals/${id}/analysis`)).statusCode).toBe(404)
  expect(transport).not.toHaveBeenCalled()
})

it('does not evaluate rows with both local fields unknown or query their cached analyses', async () => {
  const transport = vi.fn(successfulAnalysis)
  const { cache } = fakeCache()
  const { app } = await setup({ anthropicApiKey: 'test', analysisTransport: transport, cache },
    csv([{ street: 'unknown', neighborhood: ' UnKnOwN ' },
      ...[1, 2, 3].map((index) => ({ deal_id: `peer${index}` }))]))
  const result = await app.inject('/deals/row-2/analysis')
  expect(result.statusCode).toBe(200)
  expect(result.json()).toEqual({ status: 'unavailable' })
  expect(cache.get).not.toHaveBeenCalled()
  expect(transport).not.toHaveBeenCalled()
})

it('returns unavailable for missing credentials, inadequate comparisons, and model failure without harming other endpoints', async () => {
  const failing = vi.fn(async () => { throw new Error('private provider details') })
  for (const options of [{}, { anthropicApiKey: 'test', analysisTransport: failing }]) {
    const { app } = await setup(options)
    const result = await app.inject('/deals/row-2/analysis')
    expect(result.statusCode).toBe(200)
    expect(result.json()).toEqual({ status: 'unavailable' })
    expect(result.body).not.toContain('private')
    expect((await app.inject('/deals')).statusCode).toBe(200)
  }
  const transport = vi.fn(successfulAnalysis)
  const { app } = await setup({ anthropicApiKey: 'test', analysisTransport: transport }, csv())
  expect((await app.inject('/deals/row-2/analysis')).json()).toEqual({ status: 'unavailable' })
  expect(transport).not.toHaveBeenCalled()
})

it('keeps row IDs stable through deferred repairs, rejected rows, reused IDs, and restarts', async () => {
  const content = csv([
    { neighborhood: '', has_parking: 'יש' },
    { rooms: '' },
    { has_parking: 'יש', street: 'אחר' },
    { deal_id: 'D2', street: 'קו ראשון\nקו שני' },
  ])
  const repairTransport = async ({ candidates }: RepairRequest) => response(report(candidates.map((row) => proposed(row, {
    neighborhood: row.prepared.neighborhood || 'unknown',
  }))))
  for (let iteration = 0; iteration < 2; iteration++) {
    const { app } = await setup({ anthropicApiKey: 'test', repairTransport, batchSize: 1 }, content)
    expect(app.deals.map((row) => row.row_id)).toEqual(['row-2', 'row-4', 'row-5'])
    expect(app.deals.slice(0, 2).map((row) => row.deal_id)).toEqual(['D1', 'D1'])
    expect(app.deals.every((row) => !row.fixed_fields.includes('row_id' as never))).toBe(true)
    expect(app.deals[0]!.fixed_fields).toEqual(['neighborhood', 'has_parking'])
  }
})
