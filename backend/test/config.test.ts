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
      anthropicApiKey: undefined, batchSize: 1000, csvPath: defaultCsvPath,
    })
  }
})

it('treats blank and whitespace values as missing', async () => {
  const { path } = await envFile('ANTHROPIC_API_KEY=\nBATCH_SIZE="  "\nCSV_FILE_PATH="  "')
  expect(loadBackendConfig({}, path)).toEqual({ anthropicApiKey: undefined, batchSize: 1000, csvPath: defaultCsvPath })
})

it('loads the three settings and resolves quoted paths relative to the backend', async () => {
  const { path } = await envFile('ANTHROPIC_API_KEY=test-key\nBATCH_SIZE=25\nCSV_FILE_PATH="../example data.csv"')
  expect(loadBackendConfig({}, path)).toEqual({
    anthropicApiKey: 'test-key', batchSize: 25,
    csvPath: fileURLToPath(new URL('../../example data.csv', import.meta.url)),
  })
})

it('allows shell settings to override file settings and accepts absolute paths', async () => {
  const { path } = await envFile('ANTHROPIC_API_KEY=file-key\nBATCH_SIZE=25\nCSV_FILE_PATH=file.csv')
  expect(loadBackendConfig({ ANTHROPIC_API_KEY: 'shell-key', BATCH_SIZE: '50', CSV_FILE_PATH: path }, path)).toEqual({
    anthropicApiKey: 'shell-key', batchSize: 50, csvPath: path,
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
