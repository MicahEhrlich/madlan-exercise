import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { repairReportSchema } from './schema.js'
import { lookupPrompt } from './lookupPrompt.js'
import { needsLookup, parseLookupResponse } from './lookupEvidence.js'
import { repairPrompt } from './prompt.js'
import { maxOutputTokens, formatRequestTimeoutMs, lookupRequestTimeoutMs } from './types.js'
import type { RepairTransport } from './types.js'

export function createAnthropicTransport(apiKey: string): RepairTransport {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: formatRequestTimeoutMs })
  const { type, schema } = zodOutputFormat(repairReportSchema)
  return async ({ model, candidates, signal }) => {
    const lookup = candidates.some(needsLookup)
    const stream = client.messages.stream({
      model,
      max_tokens: maxOutputTokens,
      thinking: { type: 'disabled' },
      system: lookup ? lookupPrompt : repairPrompt,
      // Web-search citations are incompatible with strict JSON output_config.
      ...(lookup ? { tools: [{ type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 2 }] } : { output_config: { format: { type, schema } } }),
      messages: [{ role: 'user', content: JSON.stringify(candidates.map((row) => ({
        original: row.original, prepared: row.prepared, reasons: row.reasons,
      }))) }],
    }, { signal, maxRetries: 0, timeout: lookup ? lookupRequestTimeoutMs : formatRequestTimeoutMs })
    const message = await stream.finalMessage()
    if (lookup && message.stop_reason === 'end_turn') {
      try {
        const { report, facts } = parseLookupResponse(message, candidates)
        return { text: JSON.stringify(report), facts, stopReason: message.stop_reason,
          usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens, web_search_requests: message.usage.server_tool_use?.web_search_requests ?? 0 } }
      } catch {
        // Malformed lookup output fails this group; it is not a transport outage.
        return { text: '', facts: [], stopReason: message.stop_reason,
          usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens, web_search_requests: message.usage.server_tool_use?.web_search_requests ?? 0 } }
      }
    }
    return {
      text: message.content.filter((block) => block.type === 'text').map((block) => block.text).join(''),
      stopReason: message.stop_reason,
      usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
    }
  }
}
