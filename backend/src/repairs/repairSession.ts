import type { FastifyBaseLogger } from 'fastify'
import { createAnthropicTransport } from './anthropicTransport.js'
import { verifyRepairReport } from './verifyRepair.js'
import { defaultAnthropicModel, defaultLlmBatchSize, maxOutputTokens } from './types.js'
import type { RepairCandidate, RepairReport, RepairResponse, RepairTransport } from './types.js'
import type { Deal } from '../deals/types.js'
import { dealKey } from '../deals/dealKey.js'
import { canAttemptRepair } from './repairEvidence.js'
import { needsLookup } from './lookupEvidence.js'

export interface RepairOptions {
  anthropicApiKey?: string
  anthropicModel?: string
  llmBatchSize?: number
  repairTransport?: RepairTransport
}

type Logger = Pick<FastifyBaseLogger, 'warn' | 'info'>

// UTF-8 bytes deliberately overestimate ordinary token counts; leave envelope headroom.
export function estimateOutputTokens(candidate: RepairCandidate) {
  return Math.max(Buffer.byteLength(JSON.stringify(candidate.original)), Buffer.byteLength(JSON.stringify(candidate.prepared))) + 64
}

export function createRepairSession(logger: Logger, options: RepairOptions,
  accept: (candidate: RepairCandidate, deal: Deal) => void,
  reject: (candidate: RepairCandidate, reason: string) => void) {
  const batchSize = options.llmBatchSize ?? defaultLlmBatchSize
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) throw new Error('LLM_BATCH_SIZE must be a positive safe integer')
  const transport = options.anthropicApiKey ? options.repairTransport ?? createAnthropicTransport(options.anthropicApiKey) : undefined
  const model = options.anthropicModel ?? defaultAnthropicModel
  const outputBudget = maxOutputTokens - 256
  let pending: RepairCandidate[] = []
  let tokens = 0
  let spentMs = 0
  let stopped = false
  let requests = 0
  if (!transport) logger.info({ repairEnabled: false }, 'CSV repair disabled: ANTHROPIC_API_KEY missing')

  async function flush(): Promise<RepairReport | undefined> {
    if (!pending.length) return
    const candidates = pending
    pending = []
    tokens = 0
    const fail = (reason: string) => {
      for (const candidate of candidates) reject(candidate, reason)
    }
    const remainingMs = 30_000 - spentMs
    if (!transport || stopped || remainingMs <= 0) {
      fail('LLM repair unavailable or total API budget exhausted')
      return
    }

    requests++
    const started = performance.now()
    const controller = new AbortController()
    const deadlineMs = Math.min(10_000, remainingMs)
    let timer: ReturnType<typeof setTimeout>
    let response: RepairResponse
    try {
      const timeout = new Promise<never>((_resolve, rejectTimeout) => {
        timer = setTimeout(() => {
          controller.abort()
          rejectTimeout(new Error('Repair deadline exceeded'))
        }, deadlineMs)
      })
      // The race also bounds injected transports that fail to honor cancellation.
      response = await Promise.race([transport({ model, candidates, signal: controller.signal }), timeout])
      if (performance.now() - started >= deadlineMs) {
        controller.abort()
        throw new Error('Repair deadline exceeded')
      }
    } catch (error) {
      stopped = true
      fail('LLM request failed or timed out; further repair calls disabled')
      const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : undefined
      logger.warn({ request: requests, model, repairKind: needsLookup(candidates[0]!) ? 'lookup' : 'format',
        elapsedMs: performance.now() - started, timedOut: controller.signal.aborted, status }, 'CSV repair service unavailable; continuing import')
      return
    } finally {
      clearTimeout(timer!)
      spentMs += Math.max(0, performance.now() - started)
    }

    logger.info({ request: requests, model, elapsedMs: performance.now() - started, apiElapsedMs: spentMs, usage: response.usage }, 'CSV repair API usage')
    try {
      if (response.stopReason !== 'end_turn') throw new Error('Incomplete repair response')
      const report = verifyRepairReport(response.text, candidates, response.facts)
      const correctedDeals = new Map(report.auto_corrected_rows.map((row) => [dealKey(row), row]))
      for (const candidate of candidates) {
        const deal = correctedDeals.get(dealKey(candidate.original))
        if (deal) accept(candidate, deal)
        else reject(candidate, 'LLM could not provide a verifiable repair')
      }
      logger.info({ auto_corrected: report.auto_corrected, rows_failed_to_correct: report.rows_failed_to_correct, lookupSources: response.facts ?? [] }, 'CSV repair batch complete')
      return report
    } catch {
      fail('LLM response invalid, truncated, or unverifiable')
      return
    }
  }

  return {
    flush,
    hasPendingDeal: (deal: Pick<Deal, 'deal_id' | 'city' | 'street'>) => pending.some((candidate) => dealKey(candidate.original) === dealKey(deal)),
    async enqueue(candidate: RepairCandidate) {
      if (!canAttemptRepair(candidate.prepared, true)) {
        reject(candidate, 'LLM repair skipped: row has errors without verifiable repairs')
        return
      }
      if (!transport || stopped || spentMs >= 30_000) {
        reject(candidate, 'LLM repair unavailable or total API budget exhausted')
        return
      }
      const size = estimateOutputTokens(candidate)
      if (size > outputBudget) {
        reject(candidate, 'Row exceeds LLM output budget')
        return
      }
      // A lookup uses web search and a different response schema. Never send
      // ordinary format repairs through that slower request path.
      if (tokens + size > outputBudget || (pending.length > 0 && needsLookup(pending[0]!) !== needsLookup(candidate)) || pending.some((row) => dealKey(row.original) === dealKey(candidate.original))) await flush()
      // A preceding flush may have disabled the service or exhausted the budget.
      if (stopped || spentMs >= 30_000) {
        reject(candidate, 'LLM repair unavailable or total API budget exhausted')
        return
      }
      pending.push(candidate)
      tokens += size
      if (pending.length >= batchSize) await flush()
    },
  }
}
