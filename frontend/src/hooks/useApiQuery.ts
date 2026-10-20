import { useState } from 'react'
import { keepPreviousData, useQuery, type QueryKey } from '@tanstack/react-query'
import { ApiTimeoutError, runApiRequest } from '../api/runApiRequest'

interface ApiQueryOptions<T> {
  queryKey: QueryKey
  request: (signal: AbortSignal, onProcessing: () => void) => Promise<T>
  errorMessage: string
  timeoutMessage?: string
  keepPrevious?: boolean
  staleTime?: number
}

export function useApiQuery<T>({ queryKey, request, errorMessage, timeoutMessage = errorMessage, keepPrevious = false, staleTime = 0 }: ApiQueryOptions<T>) {
  const [processingSignal, setProcessingSignal] = useState<AbortSignal | null>(null)
  const result = useQuery({
    queryKey,
    queryFn: ({ signal }) => runApiRequest(signal, request, setProcessingSignal),
    placeholderData: keepPrevious ? keepPreviousData : undefined,
    staleTime,
  })
  return {
    data: result.isError ? undefined : result.data,
    loading: result.isPending || result.isFetching,
    processing: result.isFetching && processingSignal !== null && !processingSignal.aborted,
    error: result.isError ? (result.error instanceof ApiTimeoutError ? timeoutMessage : errorMessage) : '',
    retry: () => { void result.refetch() },
  }
}
