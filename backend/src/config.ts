import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { defaultCsvPath } from './deals/loadDeals.js'
import { defaultBatchSize } from './deals/readDealBatches.js'
import { defaultAnthropicModel, defaultLlmBatchSize } from './repairs/types.js'

const backendDirectory = fileURLToPath(new URL('../', import.meta.url))
const defaultEnvPath = new URL('../.env', import.meta.url)

export function loadBackendConfig(environment: NodeJS.ProcessEnv = process.env, envPath: string | URL = defaultEnvPath) {
  let fileValues: NodeJS.ProcessEnv = {}
  try {
    fileValues = parseEnv(readFileSync(envPath, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  // Deployment/shell variables take precedence over the local env file.
  const values = { ...fileValues, ...environment }
  const batchSize = Number(values.BATCH_SIZE?.trim() || defaultBatchSize)
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new Error('BATCH_SIZE must be a positive safe integer')
  }
  const llmBatchSize = Number(values.LLM_BATCH_SIZE?.trim() || defaultLlmBatchSize)
  if (!Number.isSafeInteger(llmBatchSize) || llmBatchSize <= 0) throw new Error('LLM_BATCH_SIZE must be a positive safe integer')
  const csvPath = values.CSV_FILE_PATH?.trim()
  return {
    anthropicApiKey: values.ANTHROPIC_API_KEY?.trim() || undefined,
    batchSize,
    llmBatchSize,
    anthropicModel: values.ANTHROPIC_MODEL?.trim() || defaultAnthropicModel,
    csvPath: csvPath ? resolve(backendDirectory, csvPath) : defaultCsvPath,
  }
}
