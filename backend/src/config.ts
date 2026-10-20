import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { defaultCsvPath } from './deals/loadDeals.js'
import { defaultBatchSize } from './deals/readDealBatches.js'
import { defaultAnthropicModel, defaultLlmBatchSize } from './repairs/types.js'
import { defaultCacheTtlSeconds, validateCacheTtlSeconds } from './cache/types.js'

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
  const corsOrigins = (values.CORS_ORIGINS?.trim() || '').split(',').map((origin) => origin.trim()).filter(Boolean).map((origin) => {
    try {
      const url = new URL(origin)
      if (['http:', 'https:'].includes(url.protocol) && url.origin === origin.replace(/\/+$/, '')) return url.origin
    } catch { /* Report invalid configuration consistently. */ }
    throw new Error('CORS_ORIGINS must contain comma-separated HTTP(S) origins without paths, credentials, queries, or fragments')
  })
  const batchSize = Number(values.BATCH_SIZE?.trim() || defaultBatchSize)
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new Error('BATCH_SIZE must be a positive safe integer')
  }
  const llmBatchSize = Number(values.LLM_BATCH_SIZE?.trim() || defaultLlmBatchSize)
  if (!Number.isSafeInteger(llmBatchSize) || llmBatchSize <= 0) throw new Error('LLM_BATCH_SIZE must be a positive safe integer')
  const csvPath = values.CSV_FILE_PATH?.trim()
  const redisUrl = values.REDIS_URL?.trim() || undefined
  if (redisUrl) {
    let valid = false
    try {
      const url = new URL(redisUrl)
      valid = ['redis:', 'rediss:'].includes(url.protocol) && Boolean(url.hostname)
    } catch { /* Report a configuration error without including credentials. */ }
    if (!valid) throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL')
  }
  const redisCacheTtlSeconds = validateCacheTtlSeconds(Number(values.REDIS_CACHE_TTL_SECONDS?.trim() || defaultCacheTtlSeconds))
  return {
    corsOrigins,
    redisUrl,
    redisCacheTtlSeconds,
    anthropicApiKey: values.ANTHROPIC_API_KEY?.trim() || undefined,
    batchSize,
    llmBatchSize,
    anthropicModel: values.ANTHROPIC_MODEL?.trim() || defaultAnthropicModel,
    csvPath: csvPath ? resolve(backendDirectory, csvPath) : defaultCsvPath,
  }
}
