// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ApiProvider from './ApiProvider'
import ImportSummary from './ImportSummary'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('shares and deduplicates API queries and keeps the client stable across rerenders', async () => {
  vi.stubEnv('VITE_API_BASE_URL', undefined)
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ total_rows: 10, parsed_rows: 9, completed_rows: 2 })))
  vi.stubGlobal('fetch', fetchMock)
  const view = render(<ApiProvider><ImportSummary /><ImportSummary /></ApiProvider>)
  expect(await screen.findAllByText('9 מתוך 10')).toHaveLength(2)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  view.rerender(<ApiProvider><ImportSummary /><ImportSummary /><ImportSummary /></ApiProvider>)
  expect(screen.getAllByText('9 מתוך 10')).toHaveLength(3)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
  view.rerender(<ApiProvider><ImportSummary /><ImportSummary /></ApiProvider>)
  expect(await screen.findAllByText('9 מתוך 10')).toHaveLength(2)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.lastCall![0]).toBe('https://api.example.com/deals/summary')
})
