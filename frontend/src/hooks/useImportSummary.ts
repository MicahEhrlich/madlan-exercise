import { useEffect, useState } from 'react'
import { fetchImportSummary } from '../api/fetchImportSummary'
import type { ImportSummary } from '../types/importSummary'

export function useImportSummary() {
  const [attempt, setAttempt] = useState(0)
  const [processingAttempt, setProcessingAttempt] = useState<number | null>(null)
  const [result, setResult] = useState<{ attempt: number; data: ImportSummary | null; error: string } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const fail = () => setResult({ attempt, data: null, error: 'לא ניתן לטעון את סיכום קליטת הנתונים. נסו שוב.' })
    const failTimeout = () => {
      active = false
      controller.abort()
      fail()
    }
    let timer = setTimeout(failTimeout, 10000)
    void fetchImportSummary(controller.signal, () => {
      if (!active) return
      setProcessingAttempt(attempt)
      clearTimeout(timer)
      timer = setTimeout(failTimeout, 10000)
    }).then((data) => {
      if (active) setResult({ attempt, data, error: '' })
    }).catch(() => {
      if (active) fail()
    }).finally(() => clearTimeout(timer))
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [attempt])
  const current = result?.attempt === attempt ? result : null
  return { data: current?.data, loading: !current, processing: !current && processingAttempt === attempt, error: current?.error, retry: () => setAttempt((value) => value + 1) }
}
