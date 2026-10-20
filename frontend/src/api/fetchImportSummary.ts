import type { ImportSummary } from '../types/importSummary'
import { fetchWhenReady } from './fetchWhenReady'

export function isImportSummary(value: unknown): value is ImportSummary {
  if (!value || typeof value !== 'object') return false
  const summary = value as Record<string, unknown>
  if (!['total_rows', 'parsed_rows', 'completed_rows'].every((key) =>
    typeof summary[key] === 'number' && Number.isSafeInteger(summary[key]) && summary[key] >= 0,
  )) return false
  return (summary.completed_rows as number) <= (summary.parsed_rows as number) &&
    (summary.parsed_rows as number) <= (summary.total_rows as number)
}

export async function fetchImportSummary(signal: AbortSignal, onProcessing: () => void): Promise<ImportSummary> {
  const response = await fetchWhenReady('/deals/summary', signal, onProcessing)
  if (!response.ok) throw new Error('לא ניתן לטעון את סיכום קליטת הנתונים.')
  const data: unknown = await response.json()
  if (!isImportSummary(data)) throw new Error('סיכום קליטת הנתונים אינו תקין.')
  return data
}
