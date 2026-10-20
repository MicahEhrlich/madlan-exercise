import { type ReactElement, type ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../src/api/queryClient'

export function renderWithQuery(ui: ReactElement) {
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, gcTime: Infinity } })
  return {
    ...render(ui, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }),
    client,
  }
}
