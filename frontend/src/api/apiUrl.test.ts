import { afterEach, expect, it, vi } from 'vitest'
import { apiUrl } from './apiUrl'

afterEach(() => vi.unstubAllEnvs())

it.each([
  [undefined, '/deals?page=2&count=20'],
  ['', '/deals?page=2&count=20'],
  ['/', '/deals?page=2&count=20'],
  [' https://api.example.com/ ', 'https://api.example.com/deals?page=2&count=20'],
  ['http://localhost:3000', 'http://localhost:3000/deals?page=2&count=20'],
  ['https://example.com/api///', 'https://example.com/api/deals?page=2&count=20'],
  ['/api/', '/api/deals?page=2&count=20'],
])('resolves API paths with base %s without changing query parameters', (base, expected) => {
  vi.stubEnv('VITE_API_BASE_URL', base)
  expect(apiUrl('/deals?page=2&count=20')).toBe(expected)
})

it.each([
  'api.example.com', '//api.example.com', 'ftp://api.example.com',
  'https://api.example.com?token=secret', 'https://api.example.com#fragment',
  'https://user:password@api.example.com', 'http://[invalid',
])('rejects invalid or ambiguous API addresses: %s', (base) => {
  vi.stubEnv('VITE_API_BASE_URL', base)
  expect(() => apiUrl('/deals/summary')).toThrow()
})
