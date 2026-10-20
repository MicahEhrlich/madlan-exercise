import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dealHeaders } from '../src/deals/types.js'
import type { RawDeal } from '../src/deals/types.js'

export const validRow: RawDeal = {
  deal_id: 'D1', city: 'חיפה', neighborhood: 'הדר', street: 'הרצל',
  property_type: 'דירה', rooms: '3', size_sqm: '100', floor: '0', total_floors: '4',
  year_built: '1990', condition: 'שמור', has_elevator: 'כן', has_parking: 'no',
  has_balcony: '1', has_safe_room: 'FALSE', deal_date: '2024-02-29',
  price_nis: '2000000', price_per_sqm: '20000', source: 'רשות המסים',
}

export function csv(rows: Partial<RawDeal>[] = [{}], headers: readonly string[] = dealHeaders) {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
  return [headers.map(quote).join(','), ...rows.map((changes) => {
    const row = { ...validRow, ...changes }
    return headers.map((key) => quote(row[key as keyof RawDeal])).join(',')
  })].join('\n')
}

export async function fixture(content: string) {
  const directory = await mkdtemp(join(tmpdir(), 'madlan-csv-'))
  const path = join(directory, 'deals.csv')
  await writeFile(path, content)
  return { directory, path }
}
