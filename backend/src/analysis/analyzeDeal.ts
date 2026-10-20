import { createHash } from 'node:crypto'
import type { FastifyBaseLogger } from 'fastify'
import type { DealCollection, SavedDeal } from '../deals/types.js'
import type { DealsCache } from '../cache/types.js'
import { cacheOperationTimeoutMs } from '../cache/types.js'
import { defaultAnthropicModel } from '../repairs/types.js'
import { eligibleForAnalysis, buildComparisons } from './comparisons.js'
import { buildAnalysisEvidence } from './evidence.js'
import { analysisUnavailable, cachedAnalysisSchema, verifyAnalysis } from './schema.js'
import type { AnalysisResult, DealAnalysis } from './schema.js'
import { analysisTimeoutMs, createAnalysisTransport } from './transport.js'
import type { AnalysisOptions, AnalysisTransport } from './transport.js'
import { withinDeadline } from './deadline.js'

const analysisTtlSeconds = 300
export const analysisPolicyVersion = 'v2'

export function analysisCacheKey(datasetHash: string, rowId: string, model: string) {
  return `analysis:${analysisPolicyVersion}:${datasetHash}:${JSON.stringify([rowId, model])}`
}

export function createDealAnalyzer(deals: DealCollection, cache: DealsCache | undefined,
  logger: Pick<FastifyBaseLogger, 'info' | 'warn'>, options: AnalysisOptions) {
  const datasetHash = createHash('sha256').update(JSON.stringify(deals)).digest('hex')
  const model = options.anthropicModel ?? defaultAnthropicModel
  const memory = new Map<string, { result: DealAnalysis; expires: number }>()
  const pending = new Map<string, Promise<AnalysisResult>>()
  let transport: AnalysisTransport | undefined

  async function evaluate(deal: Readonly<SavedDeal>): Promise<AnalysisResult> {
    const started = performance.now()
    const key = analysisCacheKey(datasetHash, deal.row_id, model)
    let outcome = 'unavailable'
    let scope: string | undefined
    let count: number | undefined
    try {
      return await withinDeadline(async (signal) => {
        const comparisons = buildComparisons(deal, deals)
        if (!comparisons) return analysisUnavailable
        scope = comparisons.baseline.scope
        count = comparisons.baseline.count
        const evidence = buildAnalysisEvidence(deal, comparisons)
        const cached = memory.get(key)
        if (cached && cached.expires > Date.now()) {
          outcome = 'memory_hit'
          return cached.result
        }
        memory.delete(key)
        if (cache?.ready) {
          try {
            const text = await withinDeadline((cacheSignal) => cache.get(key, cacheSignal), cacheOperationTimeoutMs, signal)
            if (text !== null) {
              const entry = cachedAnalysisSchema.parse(JSON.parse(text))
              if (entry.expires_at > Date.now() && entry.expires_at <= Date.now() + analysisTtlSeconds * 1000) {
                const result = verifyAnalysis(JSON.stringify(entry.analysis), comparisons, evidence)
                memory.set(key, { result, expires: entry.expires_at })
                outcome = 'redis_hit'
                return result
              }
            }
          } catch {
            logger.warn({ row_id: deal.row_id, operation: 'get_or_validate' }, 'Analysis cache unavailable or invalid; continuing analysis')
          }
        }
        if (!options.anthropicApiKey || signal.aborted) return analysisUnavailable
        transport ??= options.analysisTransport ?? createAnalysisTransport(options.anthropicApiKey)
        const response = await transport({ model, deal, comparisons, evidence, signal })
        if (signal.aborted || performance.now() - started >= analysisTimeoutMs) return analysisUnavailable
        logger.info({ row_id: deal.row_id, model, usage: response.usage }, 'Deal analysis API usage')
        if (response.stopReason !== 'end_turn') return analysisUnavailable
        const result = verifyAnalysis(response.text, comparisons, evidence)
        const expires = Date.now() + analysisTtlSeconds * 1000
        if (cache?.ready) {
          try {
            await withinDeadline((cacheSignal) => cache.set(key, JSON.stringify({ analysis: result, expires_at: expires }), analysisTtlSeconds, cacheSignal), cacheOperationTimeoutMs, signal)
          } catch {
            logger.warn({ row_id: deal.row_id, operation: 'set' }, 'Analysis cache write failed; serving validated result')
          }
        }
        if (signal.aborted || performance.now() - started >= analysisTimeoutMs) return analysisUnavailable
        memory.set(key, { result, expires })
        outcome = 'analyzed'
        return result
      }, analysisTimeoutMs)
    } catch {
      outcome = 'unavailable'
      logger.warn({ row_id: deal.row_id }, 'Deal analysis failed validation or service unavailable')
      return analysisUnavailable
    } finally {
      logger.info({ row_id: deal.row_id, model, outcome, scope, count, elapsedMs: performance.now() - started }, 'Deal analysis complete')
    }
  }

  return (deal: Readonly<SavedDeal>): Promise<AnalysisResult> => {
    // Eligibility takes precedence over cache lookup, statistics, and LLM work.
    if (!eligibleForAnalysis(deal)) {
      logger.info({ row_id: deal.row_id, outcome: 'ineligible' }, 'Deal analysis complete')
      return Promise.resolve(analysisUnavailable)
    }
    if (!options.anthropicApiKey) {
      logger.info({ row_id: deal.row_id, outcome: 'missing_credentials' }, 'Deal analysis complete')
      return Promise.resolve(analysisUnavailable)
    }
    const existing = pending.get(deal.row_id)
    if (existing) return existing
    const task = evaluate(deal).finally(() => { pending.delete(deal.row_id) })
    pending.set(deal.row_id, task)
    return task
  }
}
