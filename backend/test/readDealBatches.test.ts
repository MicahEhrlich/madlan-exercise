import { rm } from 'node:fs/promises'
import { afterEach, expect, it } from 'vitest'
import { readDealBatches } from '../src/deals/readDealBatches.js'
import { csv, fixture } from './fixtures.js'

const directories: string[] = []
async function file(content: string) {
  const result = await fixture(content)
  directories.push(result.directory)
  return result.path
}
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true }))) })

it('yields full batches and a final partial batch with continuous record numbers', async () => {
  const path = await file(csv(Array.from({ length: 5 }, (_, i) => ({ deal_id: `D${i}` }))))
  const sizes: number[] = []
  const starts: number[] = []
  for await (const batch of readDealBatches(path, 2)) {
    sizes.push(batch.records.length)
    starts.push(batch.firstRecordNumber)
  }
  expect(sizes).toEqual([2, 2, 1])
  expect(starts).toEqual([2, 4, 6])
})

it('honors backpressure and permits early termination without leaving streams open', async () => {
  const path = await file(csv(Array.from({ length: 4 }, (_, i) => ({ deal_id: `D${i}` }))))
  const reader = readDealBatches(path, 1)
  const first = await reader.next()
  expect(first.value.records[0][0]).toBe('D0')
  await reader.return(undefined)
  expect(await reader.next()).toEqual({ done: true, value: undefined })
})

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('rejects invalid batch size %s', async (batchSize) => {
  await expect(readDealBatches('unused.csv', batchSize).next()).rejects.toThrow('CSV batch size must be a positive safe integer')
})

it('preserves quoted fields across byte and batch boundaries', async () => {
  const street = 'רחוב, "ארוך"\n'.repeat(12000)
  const path = await file('\uFEFF' + csv([{ street }, { deal_id: 'D2' }]) + '\n\n')
  const reader = readDealBatches(path, 1)
  expect((await reader.next()).value.records[0][3]).toBe(street)
  expect((await reader.next()).value.firstRecordNumber).toBe(3)
  expect((await reader.next()).done).toBe(true)
})
