import { useEffect, useState } from 'react'
import { fetchDeals } from '../api/fetchDeals'
import type { DealsPage } from '../types/dealsPage'
import type { DealFilters } from '../utils/filterDeals'

export function useDeals(page: number, count: number, filters: DealFilters, query: string) {
  const [attempt, setAttempt] = useState(0)
  const [processingKey, setProcessingKey] = useState('')
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ''))
  if (query.trim()) params.set('q', query.trim())
  const filterQuery = params.toString()
  const key = `${page}-${count}-${attempt}-${filterQuery}`
  const [result, setResult] = useState<{ key: string; data: DealsPage | null; error: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const failTimeout = () => {
      active = false
      controller.abort()
      setResult({ key, data: null, error: 'טעינת העסקאות ארכה זמן רב מדי. נסו שוב.' })
    }
    let timeout = setTimeout(failTimeout, 10000)
    void fetchDeals(page, count, controller.signal, filterQuery, () => {
      if (!active) return
      setProcessingKey(key)
      clearTimeout(timeout)
      timeout = setTimeout(failTimeout, 10000)
    }).then((result) => {
      if (active) setResult({ key, data: result, error: '' })
    }).catch(() => {
      if (active) setResult({ key, data: null, error: 'לא ניתן לטעון את העסקאות. נסו שוב.' })
    }).finally(() => {
      clearTimeout(timeout)
    })
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [page, count, key, filterQuery])

  const current = result?.key === key ? result : null
  return { data: current ? current.data : result?.data ?? null, loading: !current, processing: !current && processingKey === key, error: current?.error ?? '', retry: () => setAttempt((value) => value + 1) }
}
