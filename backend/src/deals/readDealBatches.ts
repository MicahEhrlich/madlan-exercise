import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { parse } from 'csv-parse'
import { dealHeaders } from './types.js'

export const defaultBatchSize = 1000

export interface CsvBatch {
  headers: readonly string[]
  records: readonly string[][]
  firstRecordNumber: number
}

/** Read bounded batches of data records. Header = record 1; empty lines are skipped. */
export async function* readDealBatches(csvPath: string | URL, batchSize = defaultBatchSize): AsyncGenerator<CsvBatch> {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new Error('CSV batch size must be a positive safe integer')
  }

  const input = createReadStream(csvPath)
  const parser = parse({ bom: true, skip_empty_lines: true, relax_column_count: true })
  const completion = pipeline(input, parser)
  // The pipeline may reject while the consumer is processing a yielded batch.
  void completion.catch(() => {})
  let headers: string[] | undefined
  let records: string[][] = []
  let firstRecordNumber = 2

  try {
    for await (const record of parser) {
      const fields = record as string[]
      if (!headers) {
        headers = fields.map((header) => header.trim())
        if (headers.length !== dealHeaders.length || new Set(headers).size !== headers.length ||
          !dealHeaders.every((header) => headers!.includes(header))) {
          throw new Error('Invalid deals CSV headers: expected all 19 unique deal columns')
        }
        continue
      }
      records.push(fields)
      if (records.length === batchSize) {
        yield { headers, records, firstRecordNumber }
        firstRecordNumber += records.length
        records = []
      }
    }
    await completion
    if (!headers) throw new Error('Invalid deals CSV headers: expected all 19 unique deal columns')
    if (records.length) yield { headers, records, firstRecordNumber }
  } catch (cause) {
    throw new Error(`Could not read or parse deals CSV: ${String(csvPath)}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
  } finally {
    input.destroy()
    parser.destroy()
    await completion.catch(() => {})
  }
}
