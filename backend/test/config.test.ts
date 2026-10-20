import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { loadBackendConfig } from '../src/config.js'
import { defaultCsvPath } from '../src/deals/loadDeals.js'
import { fixture } from './fixtures.js'

const directories: string[] = []
async function envFile(content: string) {
  const result = await fixture(content)
  directories.push(result.directory)
  return result
}
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true }))) })

it('uses existing defaults when settings or the env file are missing', async () => {
  const { path } = await envFile('')
  for (const envPath of [path, path + '.missing']) {
    expect(loadBackendConfig({}, envPath)).toEqual({
      redisUrl: undefined, redisCacheTtlSeconds: 300,
      anthropicApiKey: undefined, llmBatchSize: 5, anthropicModel: 'claude-haiku-4-5-20251001', batchSize: 1000, csvPath: defaultCsvPath,
    })
  }
})

it('treats blank and whitespace values as missing', async () => {
  const { path } = await envFile('ANTHROPIC_API_KEY=\nBATCH_SIZE="  "\nCSV_FILE_PATH="  "')
  expect(loadBackendConfig({}, path)).toEqual({ redisUrl: undefined, redisCacheTtlSeconds: 300, anthropicApiKey: undefined, llmBatchSize: 5, anthropicModel: 'claude-haiku-4-5-20251001', batchSize: 1000, csvPath: defaultCsvPath })
})

it('loads the three settings and resolves quoted paths relative to the backend', async () => {
  const { path } = await envFile('ANTHROPIC_API_KEY=test-key\nBATCH_SIZE=25\nCSV_FILE_PATH="../example data.csv"')
  expect(loadBackendConfig({}, path)).toEqual({
    redisUrl: undefined, redisCacheTtlSeconds: 300,
    anthropicApiKey: 'test-key', batchSize: 25, llmBatchSize: 5, anthropicModel: 'claude-haiku-4-5-20251001',
    csvPath: fileURLToPath(new URL('../../example data.csv', import.meta.url)),
  })
})

it('allows shell settings to override file settings and accepts absolute paths', async () => {
  const { path } = await envFile('ANTHROPIC_API_KEY=file-key\nBATCH_SIZE=25\nCSV_FILE_PATH=file.csv')
  expect(loadBackendConfig({ ANTHROPIC_API_KEY: 'shell-key', BATCH_SIZE: '50', CSV_FILE_PATH: path }, path)).toEqual({
    redisUrl: undefined, redisCacheTtlSeconds: 300,
    anthropicApiKey: 'shell-key', batchSize: 50, llmBatchSize: 5, anthropicModel: 'claude-haiku-4-5-20251001', csvPath: path,
  })
})

it.each(['0', '-1', '1.5', 'invalid', 'Infinity', '9007199254740992'])('rejects invalid BATCH_SIZE %s', async (value) => {
  const { path } = await envFile('')
  expect(() => loadBackendConfig({ BATCH_SIZE: value }, path)).toThrow('BATCH_SIZE must be a positive safe integer')
})

it('does not suppress env file errors other than a missing file', async () => {
  const { directory } = await envFile('')
  expect(() => loadBackendConfig({}, directory)).toThrow()
})

it('loads independent LLM batch size and model without changing CSV batch size', async () => {
  const { path } = await envFile('LLM_BATCH_SIZE=3\nANTHROPIC_MODEL=custom-model\nBATCH_SIZE=250')
  expect(loadBackendConfig({}, path)).toMatchObject({ batchSize: 250, llmBatchSize: 3, anthropicModel: 'custom-model' })
  expect(() => loadBackendConfig({ LLM_BATCH_SIZE: '0' }, path)).toThrow('LLM_BATCH_SIZE must be a positive safe integer')
})

it('loads Redis settings with defaults, trimming, and environment precedence', async () => {
  const { path } = await envFile('REDIS_URL=redis://localhost:6379\nREDIS_CACHE_TTL_SECONDS=60')
  expect(loadBackendConfig({}, path)).toMatchObject({ redisUrl: 'redis://localhost:6379', redisCacheTtlSeconds: 60 })
  expect(loadBackendConfig({ REDIS_URL: ' rediss://user:secret@cache.example:6380/1 ', REDIS_CACHE_TTL_SECONDS: ' 120 ' }, path))
    .toMatchObject({ redisUrl: 'rediss://user:secret@cache.example:6380/1', redisCacheTtlSeconds: 120 })
  expect(loadBackendConfig({ REDIS_URL: ' ', REDIS_CACHE_TTL_SECONDS: '' }, path)).toMatchObject({ redisUrl: undefined, redisCacheTtlSeconds: 300 })
})

it.each(['0', '-1', '1.5', 'invalid', 'Infinity', '9007199254740992'])('rejects invalid Redis TTL %s', async (value) => {
  const { path } = await envFile('')
  expect(() => loadBackendConfig({ REDIS_CACHE_TTL_SECONDS: value }, path)).toThrow('REDIS_CACHE_TTL_SECONDS must be a positive safe integer')
})

it.each(['broken', 'https://user:secret@cache.example', 'redis:///'])('rejects invalid Redis URLs without exposing credentials', async (value) => {
  const { path } = await envFile('')
  expect(() => loadBackendConfig({ REDIS_URL: value }, path)).toThrow(/^REDIS_URL must be a valid redis:\/\/ or rediss:\/\/ URL$/)
})
