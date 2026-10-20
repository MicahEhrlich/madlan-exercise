const monthNames: Readonly<Record<string, number>> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
  ינואר: 1, פברואר: 2, מרץ: 3, אפריל: 4, מאי: 5, יוני: 6,
  יולי: 7, אוגוסט: 8, ספטמבר: 9, אוקטובר: 10, נובמבר: 11, דצמבר: 12,
}

/** Evidence for checking a model's date proposal; this does not repair the input itself. */
export function dateRepairEvidence(value: string): { date: string; dayDefaulted: boolean } | undefined {
  const text = value.trim().toLowerCase()
  let year: number
  let month: number
  let day = 1
  let dayDefaulted = false
  let match: RegExpExecArray | null
  if ((match = /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/.exec(text))) {
    year = Number(match[1]); month = Number(match[3]); day = Number(match[4])
  } else if ((match = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})$/.exec(text))) {
    day = Number(match[1]); month = Number(match[3]); year = Number(match[4])
  } else if ((match = /^(\d{4})[-/.](\d{1,2})$/.exec(text))) {
    year = Number(match[1]); month = Number(match[2]); dayDefaulted = true
  } else if ((match = /^(\d{1,2})[-/.](\d{4})$/.exec(text))) {
    month = Number(match[1]); year = Number(match[2]); dayDefaulted = true
  } else if ((match = /^([\p{L}]+)\.?[\s-]+(\d{4})$/u.exec(text))) {
    month = monthNames[match[1]!] ?? 0; year = Number(match[2]); dayDefaulted = true
  } else if ((match = /^(\d{1,2})\s+([\p{L}]+)\.?\s+(\d{4})$/u.exec(text))) {
    day = Number(match[1]); month = monthNames[match[2]!] ?? 0; year = Number(match[3])
  } else if ((match = /^([\p{L}]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/u.exec(text))) {
    month = monthNames[match[1]!] ?? 0; day = Number(match[2]); year = Number(match[3])
  } else return undefined

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const parsed = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return undefined
  return { date, dayDefaulted }
}
