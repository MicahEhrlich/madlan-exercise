import { rm } from 'node:fs/promises'
import { Writable } from 'node:stream'
import { afterEach, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { csv, fixture } from './fixtures.js'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true }))) })

it('loads once before health requests and logs rejected rows separately', async () => {
  const { path, directory } = await fixture(csv([{}, { deal_id: 'D2', rooms: 'wrong' }]))
  directories.push(directory)
  const logs: Record<string, unknown>[] = []
  const stream = new Writable({ write(chunk, _encoding, callback) { logs.push(JSON.parse(String(chunk))); callback() } })
  const app = buildApp({ logger: { stream } }, { csvPath: path })
  try {
    expect(app.deals).toHaveLength(0)
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
    expect(app.deals).toHaveLength(1)
    expect(app.deals[0]!.deal_id).toBe('D1')
    await app.inject({ method: 'GET', url: '/health' })
    expect(logs.filter((log) => log.msg === 'Rejected CSV deal')).toHaveLength(1)
    expect(logs.filter((log) => log.msg === 'Deals CSV load complete')).toEqual([expect.objectContaining({ accepted: 1, rejected: 1, total: 2 })])
    expect((await app.inject('/deals')).json().rows).toEqual(app.deals)
  } finally {
    await app.close()
  }
})

it('fails readiness when loading fails', async () => {
  const { path, directory } = await fixture('bad headers')
  directories.push(directory)
  const app = buildApp({}, { csvPath: path })
  try {
    await expect(app.ready()).rejects.toThrow('Invalid deals CSV headers')
  } finally {
    await app.close()
  }
})

it('supports configured batching during startup and publishes the complete collection only when ready', async () => {
  const { path, directory } = await fixture(csv([{}, { deal_id: 'D2' }, { deal_id: 'D3' }]))
  directories.push(directory)
  const app = buildApp({}, { csvPath: path, batchSize: 1 })
  try {
    expect(app.deals).toHaveLength(0)
    await app.ready()
    expect(app.deals.map((deal) => deal.deal_id)).toEqual(['D1', 'D2', 'D3'])
    expect(Object.isFrozen(app.deals)).toBe(true)
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' })
  } finally {
    await app.close()
  }
})

it('does not expose partially loaded data if a later batch fails', async () => {
  const { path, directory } = await fixture(csv(Array.from({ length: 1000 }, (_, index) => ({ deal_id: `D${index}` }))) + '\n"unterminated')
  directories.push(directory)
  const app = buildApp({}, { csvPath: path, batchSize: 10 })
  try {
    await expect(app.ready()).rejects.toThrow('Could not read or parse deals CSV')
    expect(app.deals).toHaveLength(0)
  } finally {
    await app.close()
  }
})
