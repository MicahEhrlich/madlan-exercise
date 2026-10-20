import { z } from 'zod'
import type { Message } from '@anthropic-ai/sdk/resources/messages'
import { dealKey } from '../deals/dealKey.js'
import { dealSchema, rawDealSchema } from './schema.js'
import type { RepairCandidate, RepairReport } from './types.js'

export interface VerifiedLookupFact {
  identity: string
  field: 'year_built' | 'neighborhood'
  value: number | string
  url: string
  quote: string
}

export const lookupReportSchema = z.strictObject({
  auto_corrected: z.number().int().nonnegative(),
  rows_failed_to_correct: z.number().int().nonnegative(),
  auto_corrected_rows: z.array(dealSchema),
  failed_rows: z.array(rawDealSchema),
  lookup_evidence: z.array(z.strictObject({
    deal_id: z.string(), city: z.string(), street: z.string(),
    field: z.enum(['year_built', 'neighborhood']), value: z.union([z.string(), z.number()]),
    source_url: z.string(), quote: z.string(), scope: z.literal('entire_street'),
  })),
})

export function needsLookup(candidate: Pick<RepairCandidate, 'prepared'>) {
  return !candidate.prepared.year_built.trim() || !candidate.prepared.neighborhood.trim()
}

function normalized(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Only accept evidence that is actually cited in retrieved search results. */
export function parseLookupResponse(message: Message, candidates: readonly RepairCandidate[]): { report: RepairReport; facts: VerifiedLookupFact[] } {
  const lastSearch = message.content.reduce((last, block, index) => block.type === 'web_search_tool_result' ? index : last, -1)
  const text = message.content.slice(lastSearch + 1).filter((block) => block.type === 'text').map((block) => block.text).join('')
  const parsed = lookupReportSchema.parse(JSON.parse(text))
  if (parsed.auto_corrected !== parsed.auto_corrected_rows.length || parsed.rows_failed_to_correct !== parsed.failed_rows.length ||
    parsed.auto_corrected + parsed.rows_failed_to_correct !== candidates.length) throw new Error('Invalid lookup accounting')

  const retrievedUrls = new Set(message.content.flatMap((block) => block.type === 'web_search_tool_result' && Array.isArray(block.content) ? block.content.map((result) => result.url) : []))
  const citations = message.content.flatMap((block) => block.type === 'text' ? (block.citations ?? []).filter((citation) => citation.type === 'web_search_result_location') : [])
  const byIdentity = new Map(candidates.map((row) => [dealKey(row.original), row]))
  const facts: VerifiedLookupFact[] = []
  for (const proof of parsed.lookup_evidence) {
    const identity = dealKey(proof)
    const candidate = byIdentity.get(identity)
    if (!candidate || candidate.prepared[proof.field].trim()) continue
    const quote = normalized(proof.quote)
    const citation = citations.find((item) => item.url === proof.source_url && normalized(item.cited_text).includes(quote))
    if (!quote || !proof.source_url.startsWith('https://') || !retrievedUrls.has(proof.source_url) || !citation) continue
    if (/(?:^|\s)(?:not|לא|אינו|אינה)(?:\s|$)/u.test(quote)) continue
    if (![candidate.prepared.city, candidate.prepared.street, String(proof.value)].every((value) => normalized(value) && quote.includes(normalized(value)))) continue
    // No building number exists in this dataset. A result for one building cannot
    // identify our property; the source must explicitly cover the entire street.
    if (proof.field === 'neighborhood') {
      if (typeof proof.value !== 'string' || proof.value === 'unknown' || !/(?:כל הרחוב|הרחוב כולו|entire street|whole street)/u.test(quote)) continue
    } else {
      if (typeof proof.value !== 'number' || !Number.isInteger(proof.value) || proof.value <= 0 ||
        !/(?:כל הבניינים|כל המבנים|all buildings|all properties)/u.test(quote) || !new RegExp(`(?:נבנו|נבנה|built|constructed)\\s+(?:in\\s+|בשנת\\s+|ב[-־]?\\s*)?${proof.value}(?:$|[^0-9])`, 'u').test(quote)) continue
    }
    facts.push({ identity, field: proof.field, value: proof.value, url: proof.source_url, quote: proof.quote })
  }
  // Conflicting source-backed answers are unresolved, even if one was proposed first.
  const unambiguousFacts = facts.filter((fact) => !facts.some((other) => other.identity === fact.identity && other.field === fact.field && other.value !== fact.value))
  const report: RepairReport = { auto_corrected: 0, rows_failed_to_correct: 0, auto_corrected_rows: [], failed_rows: [...parsed.failed_rows] as RepairReport['failed_rows'] }
  for (const row of parsed.auto_corrected_rows) {
    const original = byIdentity.get(dealKey(row))
    if (!original) throw new Error('Unknown lookup result')
    report.auto_corrected_rows.push(row)
  }
  report.auto_corrected = report.auto_corrected_rows.length
  report.rows_failed_to_correct = report.failed_rows.length
  return { report, facts: unambiguousFacts }
}
